package lifecycle

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/CSTAM-well-contained/monorepo/internal/store"
)

// The team portal: a team signs in with its own token, deploys a container image to its
// sandbox and decides whether its subdomain is published on the gateways.

// tokenPrefix makes team tokens recognizable (and distinct from the admin, viewer and
// gateway tokens, which are plain hex).
const tokenPrefix = "team_"

// newToken returns a fresh team token and the SHA-256 that the database keeps.
func newToken() (token, hash string, err error) {
	b := make([]byte, 20)
	if _, err := rand.Read(b); err != nil {
		return "", "", fmt.Errorf("team token: %w", err)
	}
	token = tokenPrefix + hex.EncodeToString(b)
	return token, hashToken(token), nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// TeamByToken returns the live team whose portal token this is, or ErrNotFound.
func (c *Controller) TeamByToken(ctx context.Context, token string) (Team, error) {
	if len(token) != len(tokenPrefix)+40 || token[:len(tokenPrefix)] != tokenPrefix {
		return Team{}, fmt.Errorf("team token: %w", ErrNotFound)
	}
	rows, err := c.db.Query(ctx, teamSelect+` WHERE t.token_hash = $1 AND t.state NOT IN ('deleting', 'deleted')`,
		hashToken(token))
	if err != nil {
		return Team{}, fmt.Errorf("team by token: %w", err)
	}
	t, err := pgx.CollectExactlyOneRow(rows, scanTeam)
	if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, pgx.ErrTooManyRows) {
		return Team{}, fmt.Errorf("team token: %w", ErrNotFound)
	}
	return t, err
}

// RotateToken gives a team a new portal token; the old one stops working at once.
func (c *Controller) RotateToken(ctx context.Context, id int64) (string, error) {
	token, hash, err := newToken()
	if err != nil {
		return "", err
	}
	tag, err := c.db.Exec(ctx,
		`UPDATE teams SET token_hash = $2, updated_at = now() WHERE id = $1 AND state NOT IN ('deleting', 'deleted')`,
		id, hash)
	if err != nil {
		return "", fmt.Errorf("rotate token: %w", err)
	}
	if tag.RowsAffected() == 0 {
		if _, err := c.Team(ctx, id); err != nil {
			return "", err
		}
		return "", fmt.Errorf("team %d is going away: %w", id, ErrBusy)
	}
	if err := c.event(ctx, c.db, "team.token", id, nil); err != nil {
		return "", err
	}
	return token, nil
}

// SetExposed publishes the team's subdomain on the gateways (true) or takes it off (false).
// The sandbox, its IP and its slot stay; only the route changes, without any reload.
func (c *Controller) SetExposed(ctx context.Context, id int64, exposed bool) (Team, error) {
	changed := false
	err := store.InTx(ctx, c.db, func(tx pgx.Tx) error {
		var state string
		var was bool
		err := tx.QueryRow(ctx, `SELECT state, exposed FROM teams WHERE id = $1 FOR UPDATE`, id).Scan(&state, &was)
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("team %d: %w", id, ErrNotFound)
		}
		if err != nil {
			return fmt.Errorf("expose: %w", err)
		}
		if state == "deleting" || state == "deleted" {
			return fmt.Errorf("team %d is %s: %w", id, state, ErrBusy)
		}
		if was == exposed {
			return nil
		}
		changed = true
		if _, err := tx.Exec(ctx, `UPDATE teams SET exposed = $2, updated_at = now() WHERE id = $1`, id, exposed); err != nil {
			return fmt.Errorf("expose: %w", err)
		}
		if _, err := tx.Exec(ctx, `UPDATE routes_generation SET gen = gen + 1`); err != nil {
			return fmt.Errorf("expose: %w", err)
		}
		kind := "team.hidden"
		if exposed {
			kind = "team.exposed"
		}
		return c.event(ctx, tx, kind, id, nil)
	})
	if err != nil {
		return Team{}, err
	}
	if changed {
		c.notify()
	}
	return c.Team(ctx, id)
}

// Deploy replaces the team's sandbox with one running image on appPort, at the same IP and
// slot. The route stays during the swap (visitors get the maintenance page). If the new
// image does not start, the previous one is started again and the error is kept on the team.
// An empty image means the platform's default page.
func (c *Controller) Deploy(ctx context.Context, id int64, image string, appPort int) (Team, error) {
	if appPort == 0 {
		appPort = 80
	}
	t, err := c.Team(ctx, id)
	if err != nil {
		return Team{}, err
	}
	if err := validTeam(t.Hackathon, t.Name, appPort, image); err != nil {
		return Team{}, err
	}
	var prevImage string
	var prevPort int
	err = store.InTx(ctx, c.db, func(tx pgx.Tx) error {
		var state string
		err := tx.QueryRow(ctx, `SELECT state, image, app_port FROM teams WHERE id = $1 FOR UPDATE`, id).
			Scan(&state, &prevImage, &prevPort)
		if err != nil {
			return fmt.Errorf("deploy: %w", err)
		}
		if state != "ready" {
			return fmt.Errorf("team %s is %s, deploy when it is ready: %w", t.Name, state, ErrBusy)
		}
		if _, err := tx.Exec(ctx,
			`UPDATE teams SET state = 'provisioning', image = $2, app_port = $3, error = '', updated_at = now()
			 WHERE id = $1`, id, image, appPort); err != nil {
			return fmt.Errorf("deploy: %w", err)
		}
		if appPort != prevPort { // the route points at the new port
			if _, err := tx.Exec(ctx, `UPDATE routes_generation SET gen = gen + 1`); err != nil {
				return fmt.Errorf("deploy: %w", err)
			}
		}
		return c.event(ctx, tx, "team.deploying", id, map[string]any{"image": image, "app_port": appPort})
	})
	if err != nil {
		return Team{}, err
	}
	c.notify()
	c.spawn(id, func(ctx context.Context, id int64) { c.redeploy(ctx, id, prevImage, prevPort) })
	return c.Team(ctx, id)
}

// redeploy swaps the sandbox of a team that Deploy put back in provisioning.
func (c *Controller) redeploy(ctx context.Context, id int64, prevImage string, prevPort int) {
	t, err := c.Team(ctx, id)
	if err != nil || t.State != "provisioning" {
		return
	}
	start := time.Now()
	dctx, cancel := context.WithTimeout(ctx, c.DeleteTimeout)
	err = c.sbx.Delete(dctx, refOf(t))
	cancel()
	if err != nil {
		c.finishDeploy(ctx, id, refOf(t), prevImage, prevPort, "deploy failed, previous version kept: "+err.Error(), start)
		return
	}
	spec := specOf(t)
	cctx, cancel := context.WithTimeout(ctx, c.CreateTimeout)
	ref, err := c.sbx.Create(cctx, spec)
	cancel()
	if ref.Name == "" {
		ref.Name = spec.Name()
	}
	if err == nil {
		c.finishDeploy(ctx, id, ref, t.Image, t.AppPort, "", start)
		return
	}
	c.log.Warn("deploy failed, restoring the previous version", "team", id, "image", t.Image, "err", err)
	cause := err
	if derr := c.sbx.Delete(ctx, Ref{Name: spec.Name()}); derr != nil {
		c.log.Warn("clean up failed deploy", "team", id, "err", derr)
	}
	spec.Image, spec.AppPort = prevImage, prevPort
	cctx, cancel = context.WithTimeout(ctx, c.CreateTimeout)
	ref, err = c.sbx.Create(cctx, spec)
	cancel()
	if ref.Name == "" {
		ref.Name = spec.Name()
	}
	if err != nil {
		c.fail(ctx, id, ref, fmt.Errorf("deploy of %s failed (%w), and the previous version did not start again: %w",
			orDefault(t.Image), cause, err))
		return
	}
	c.finishDeploy(ctx, id, ref, prevImage, prevPort,
		fmt.Sprintf("deploy of %s failed, previous version restored: %v", orDefault(t.Image), cause), start)
}

// finishDeploy marks the team ready again with what actually runs, and the deploy outcome.
func (c *Controller) finishDeploy(ctx context.Context, id int64, ref Ref, image string, port int, msg string, start time.Time) {
	if len(msg) > 500 {
		msg = msg[:500]
	}
	done := false
	err := store.InTx(ctx, c.db, func(tx pgx.Tx) error {
		var oldPort int
		if err := tx.QueryRow(ctx, `SELECT app_port FROM teams WHERE id = $1 FOR UPDATE`, id).Scan(&oldPort); err != nil {
			return err
		}
		tag, err := tx.Exec(ctx,
			`UPDATE teams SET state = 'ready', sandbox_ref = $2, image = $3, app_port = $4, error = $5, updated_at = now()
			 WHERE id = $1 AND state = 'provisioning'`, id, ref.String(), image, port, msg)
		if err != nil || tag.RowsAffected() == 0 {
			return err // deleted meanwhile: the teardown removes the sandbox
		}
		done = true
		if oldPort != port {
			if _, err := tx.Exec(ctx, `UPDATE routes_generation SET gen = gen + 1`); err != nil {
				return err
			}
		}
		return c.event(ctx, tx, "team.deployed", id, map[string]any{
			"image": image, "app_port": port, "error": msg, "seconds": time.Since(start).Seconds()})
	})
	if err != nil {
		c.log.Error("finish deploy", "team", id, "err", err) // still provisioning: the reconciler retries
		return
	}
	if !done {
		c.teardown(ctx, id)
		return
	}
	c.notify()
	c.log.Info("team deployed", "team", id, "image", orDefault(image), "error", msg, "took", time.Since(start).String())
}

func orDefault(image string) string {
	if image == "" {
		return "the default page"
	}
	return image
}
