import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Hidden checks for tasks on pinned gorilla/mux commits. Each follows the tests of the upstream fix, through the public API.
const header = `package hidden

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
)

func ok(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) }

func status(h http.Handler, method, url string) int {
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(method, url, nil))
	return w.Code
}

func queryRouter() *mux.Router {
	r := mux.NewRouter()
	r.HandleFunc("/api", ok).Methods("POST")
	r.HandleFunc("/api", ok).Queries("time", "{time:[0-9]+}").Methods("GET")
	return r
}

func queryMismatch(t *testing.T) {
	r := queryRouter()
	post, _ := http.NewRequest("POST", "http://localhost/api", nil)
	m := new(mux.RouteMatch)
	if !r.Match(post, m) || m.MatchErr != nil {
		t.Errorf("POST /api: matched with error %v", m.MatchErr)
	}
	get, _ := http.NewRequest("GET", "http://localhost/api?time=-4", nil)
	m = new(mux.RouteMatch)
	if r.Match(get, m) || m.MatchErr != mux.ErrNotFound {
		t.Errorf("GET /api?time=-4: want ErrNotFound, got %v", m.MatchErr)
	}
	if got := status(r, "GET", "http://localhost/api?time=-4"); got != http.StatusNotFound {
		t.Errorf("GET /api?time=-4: status %d", got)
	}
	if got := status(r, "GET", "http://localhost/api?time=4"); got != http.StatusOK {
		t.Errorf("GET /api?time=4: status %d", got)
	}
	r2 := mux.NewRouter()
	r2.HandleFunc("/api2", ok).Methods("POST")
	other, _ := http.NewRequest("GET", "http://localhost/api2", nil)
	m = new(mux.RouteMatch)
	if r2.Match(other, m) || m.MatchErr != mux.ErrMethodMismatch {
		t.Errorf("GET /api2: want ErrMethodMismatch, got %v", m.MatchErr)
	}
}

`;
const TESTS = {
  'mux-query-mismatch-status': header + `func TestHidden(t *testing.T) { queryMismatch(t) }
`,
  'mux-subrouter-method-status': header + `func TestHidden(t *testing.T) {
	r := mux.NewRouter()
	sub := r.PathPrefix("/v1").Subrouter()
	sub.HandleFunc("/api", ok).Methods(http.MethodGet)
	sub.HandleFunc("/api/{id}", ok).Methods(http.MethodGet)
	if got := status(r, http.MethodPut, "/v1/api"); got != http.StatusMethodNotAllowed {
		t.Errorf("PUT /v1/api: status %d", got)
	}
	if got := status(r, http.MethodGet, "/v1/api/7"); got != http.StatusOK {
		t.Errorf("GET /v1/api/7: status %d", got)
	}
	if got := status(r, http.MethodGet, "/v1/other"); got != http.StatusNotFound {
		t.Errorf("GET /v1/other: status %d", got)
	}
	queryMismatch(t)
}
`,
  'mux-host-port-vars': header + `func vars(t *testing.T, tpl, url string) map[string]string {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		t.Fatal(err)
	}
	var m mux.RouteMatch
	if !mux.NewRouter().NewRoute().Host(tpl).Match(req, &m) {
		t.Fatalf("%s did not match %s", tpl, url)
	}
	return m.Vars
}

func same(a, b map[string]string) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if b[k] != v {
			return false
		}
	}
	return true
}

func TestHidden(t *testing.T) {
	_ = ok
	_ = status
	three := "{foo:[a-z][a-z][a-z]}.{bar:[a-z][a-z][a-z]}.{baz:[a-z][a-z][a-z]}"
	want := map[string]string{"foo": "abc", "bar": "def", "baz": "ghi"}
	if got := vars(t, three, "http://abc.def.ghi:65535/"); !same(got, want) {
		t.Errorf("no port in template, port in request: %v", got)
	}
	if got := vars(t, three, "http://abc.def.ghi/"); !same(got, want) {
		t.Errorf("no port anywhere: %v", got)
	}
	want["port"] = "65535"
	if got := vars(t, three+":{port:.*}", "http://abc.def.ghi:65535/"); !same(got, want) {
		t.Errorf("port in template: %v", got)
	}
	u, err := new(mux.Route).Host("{subdomain}.domain.com:{port:.*}").URL("subdomain", "bar", "port", "65535")
	if err != nil || u.String() != "http://bar.domain.com:65535" {
		t.Errorf("URL building: %v %v", u, err)
	}
}
`,
};

const source = TESTS[process.env.TASK_ID];
if (!source) throw new Error(`Unknown task ${process.env.TASK_ID}`);
// The check runs on a copy so the graded workspace is left exactly as the agent left it.
const copy = mkdtempSync(path.join(os.tmpdir(), 'gw-dad-mux-'));
try {
  cpSync(process.env.WORKSPACE_DIR, copy, { recursive: true, filter: (file) => !/(^|\/)\.(git|groundwork)$/.test(file) });
  mkdirSync(path.join(copy, 'zz_hidden'));
  writeFileSync(path.join(copy, 'zz_hidden/hidden_test.go'), source);
  const r = spawnSync('go', ['test', '-count=1', './zz_hidden/'], { cwd: copy, encoding: 'utf8', env: { ...process.env, GOFLAGS: '-mod=mod', GOWORK: 'off' } });
  if (r.error) throw r.error;
  process.stdout.write(r.stdout + r.stderr);
  process.exitCode = r.status ?? 1;
} finally { rmSync(copy, { recursive: true, force: true }); }
