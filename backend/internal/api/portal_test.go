package api

import (
	"strings"
	"testing"
)

func TestTeamPortalAuth(t *testing.T) {
	cases := []struct {
		name, method, path, token, body string
		code                            int
		last, contains                  string
	}{
		{"team reads itself", "GET", "/v1/team", teamTok, "", 200, "Team 42", ""},
		{"team deploys", "POST", "/v1/team/deploy", teamTok, `{"image":"nginx:alpine","app_port":80}`, 202, "Deploy 42 nginx:alpine 80", ""},
		{"team hides itself", "POST", "/v1/team/expose", teamTok, `{"exposed":false}`, 200, "SetExposed 42 false", ""},
		{"expose needs a value", "POST", "/v1/team/expose", teamTok, `{}`, 400, "", "required"},
		{"team renews", "POST", "/v1/team/renew", teamTok, "", 200, "Renew 42", ""},
		{"admin token on portal", "GET", "/v1/team", adminTok, "", 403, "", "team token"},
		{"wrong team token", "GET", "/v1/team", "team_" + strings.Repeat("0", 40), "", 401, "", ""},
		{"team token on admin route", "GET", "/v1/teams", teamTok, "", 401, "", ""},
		{"team token cannot pick another team", "POST", "/v1/teams/7/deploy", teamTok, `{"image":"x"}`, 401, "", ""},
		{"whoami team", "GET", "/v1/whoami", teamTok, "", 200, "", `"role":"team","team":"alpha","hackathon":"demo"`},
		{"whoami admin", "GET", "/v1/whoami", adminTok, "", 200, "", `"role":"admin"`},
		{"whoami nobody", "GET", "/v1/whoami", "", "", 401, "", ""},
		{"admin rotates", "POST", "/v1/teams/7/token", adminTok, "", 200, "RotateToken 7", teamTok},
		{"admin exposes", "POST", "/v1/teams/7/expose", adminTok, `{"exposed":true}`, 200, "SetExposed 7 true", ""},
		{"admin deploys", "POST", "/v1/teams/7/deploy", adminTok, `{"image":"nginx:alpine"}`, 202, "Deploy 7 nginx:alpine 0", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			st := &stub{}
			w := do(t, st, c.method, c.path, c.token, c.body)
			if w.Code != c.code {
				t.Fatalf("code %d, want %d: %s", w.Code, c.code, w.Body)
			}
			if c.last != "" && st.last != c.last {
				t.Errorf("called %q, want %q", st.last, c.last)
			}
			if c.contains != "" && !strings.Contains(w.Body.String(), c.contains) {
				t.Errorf("body %s, want %q in it", w.Body, c.contains)
			}
		})
	}
}
