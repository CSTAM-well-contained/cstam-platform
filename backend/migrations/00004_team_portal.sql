-- +goose Up
-- Team portal: each team gets its own bearer token (only its SHA-256 is stored) and can take
-- its subdomain off the gateways without losing its sandbox, IP or slot (exposed = false).
ALTER TABLE teams ADD COLUMN exposed boolean NOT NULL DEFAULT true;
ALTER TABLE teams ADD COLUMN token_hash text NOT NULL DEFAULT '';
CREATE INDEX teams_token ON teams (token_hash) WHERE token_hash <> '' AND state <> 'deleted';

-- +goose Down
DROP INDEX teams_token;
ALTER TABLE teams DROP COLUMN token_hash;
ALTER TABLE teams DROP COLUMN exposed;
