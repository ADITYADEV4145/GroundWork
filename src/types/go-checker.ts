/** Source of the Go checker, built once per Go version with the toolchain already on the machine. */
export const GO_CHECKER_SOURCE = String.raw`// Type-checks Go packages from source without compiling them.
// Packages that can change (the module's own, vendored, replaced) are checked from source, declarations only;
// the standard library and the module cache are read from the build cache's export data.
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"go/ast"
	"go/importer"
	"go/parser"
	"go/scanner"
	"go/token"
	"go/types"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
)

type target struct {
	Dir   string
	Tests bool
}

type request struct {
	Dir     string
	Targets []target
	Overlay string
	Exports string
}

type diagnostic struct {
	File    string "json:\"file\""
	Line    int    "json:\"line\""
	Column  int    "json:\"column\""
	Message string "json:\"message\""
}

type response struct {
	Diagnostics []diagnostic "json:\"diagnostics\""
	Unavailable string       "json:\"unavailable,omitempty\""
}

type listed struct {
	ImportPath   string
	Dir          string
	Name         string
	ForTest      string
	Export       string
	Standard     bool
	GoFiles      []string
	CgoFiles     []string
	TestGoFiles  []string
	XTestGoFiles []string
	Imports      []string
	TestImports  []string
	XTestImports []string
	ImportMap    map[string]string
	Module       *struct {
		Dir       string
		GoVersion string
	}
	Error *struct{ Err string }

	local  bool
	parsed map[string]*ast.File
}

type entry struct {
	once sync.Once
	pkg  *types.Package
	err  error
}

// A universe holds one type-checked instance of each package. The test universe of a package holds that package
// with its test files, and its own instance of every package that imports it, as go test builds them.
type universe struct {
	test    string
	mu      sync.Mutex
	entries map[string]*entry
}

var (
	req         request
	fset        = token.NewFileSet()
	packages    = map[string]*listed{}
	bodies      = map[string]bool{}
	overlay     = map[string]string{}
	base        = &universe{entries: map[string]*entry{}}
	exported    types.Importer
	exportMu    sync.Mutex
	exportErr   = map[string]error{}
	sourcedMemo = map[string]string{}
	arch        = runtime.GOARCH
	// What go env says of the build target, which go env -w sets without the environment.
	buildTarget string
	reachMu     sync.Mutex
	reach       = map[string]map[string]bool{}
	outMu       sync.Mutex
	out         = map[diagnostic]bool{}
	unavailable string
	work        = make(chan struct{}, runtime.NumCPU())
)

func fail(message string) {
	json.NewEncoder(os.Stdout).Encode(response{Diagnostics: []diagnostic{}, Unavailable: message})
	os.Exit(0)
}

func strip(path string) string {
	if i := strings.Index(path, " ["); i >= 0 {
		return path[:i]
	}
	return path
}

func goList(args ...string) []*listed {
	command := exec.Command("go", append([]string{"list", "-e"}, args...)...)
	command.Dir = req.Dir
	var stdout, stderr bytes.Buffer
	command.Stdout, command.Stderr = &stdout, &stderr
	if err := command.Run(); err != nil {
		line := strings.TrimSpace(strings.SplitN(stderr.String(), "\n", 2)[0])
		if line == "" {
			line = err.Error()
		}
		fail(line)
	}
	var found []*listed
	for decoder := json.NewDecoder(&stdout); ; {
		p := &listed{}
		if err := decoder.Decode(p); err == io.EOF {
			break
		} else if err != nil {
			fail("go list: " + err.Error())
		}
		found = append(found, p)
	}
	return found
}

func within(dir, root string) bool {
	rel, err := filepath.Rel(root, dir)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func load() {
	args := []string{"-deps", "-json=ImportPath,Dir,Name,ForTest,Standard,GoFiles,CgoFiles,TestGoFiles,XTestGoFiles,Imports,TestImports,XTestImports,ImportMap,Module,Error"}
	for _, t := range req.Targets {
		if t.Tests {
			args = append(args, "-test")
			break
		}
	}
	if req.Overlay != "" {
		args = append(args, "-overlay", req.Overlay)
	}
	args = append(args, "--")
	for _, t := range req.Targets {
		rel, err := filepath.Rel(req.Dir, t.Dir)
		if err != nil {
			fail(err.Error())
		}
		args = append(args, "./"+filepath.ToSlash(rel))
	}
	cache := ""
	// The sizes of the build target, which need not be this machine's.
	if output, err := exec.Command("go", "env", "GOMODCACHE", "GOARCH", "GOOS", "GOFLAGS", "CGO_ENABLED").Output(); err == nil {
		if lines := strings.Split(strings.TrimRight(string(output), "\r\n"), "\n"); len(lines) == 5 {
			cache = strings.TrimSpace(lines[0])
			if types.SizesFor("gc", strings.TrimSpace(lines[1])) != nil {
				arch = strings.TrimSpace(lines[1])
			}
			buildTarget = strings.Join(lines[1:], "\x00")
		}
	}
	for _, p := range goList(args...) {
		path := strip(p.ImportPath)
		// The generated test main, and the test builds of a target, whose files the plain entry already lists.
		if p.ForTest != "" && (path == p.ForTest || path == p.ForTest+"_test") {
			continue
		}
		if p.ForTest == "" && p.Name == "main" && strings.HasSuffix(path, ".test") && len(p.GoFiles) == 1 && filepath.IsAbs(p.GoFiles[0]) {
			continue
		}
		if packages[path] != nil && p.ForTest != "" {
			continue
		}
		p.ImportPath = path
		for i, s := range p.Imports {
			p.Imports[i] = strip(s)
		}
		for k, v := range p.ImportMap {
			p.ImportMap[k] = strip(v)
		}
		p.local = !p.Standard && p.Dir != "" && !(cache != "" && within(p.Dir, cache))
		packages[path] = p
	}
}

// The directory names the module version, so another version of a dependency never reuses a file.
func exportKey(p *listed) string {
	return strings.Join([]string{p.ImportPath, p.Dir, buildTarget}, "\x00")
}

// Export data of the packages that cannot change. The file names are kept between runs.
func exports() {
	known := map[string]string{}
	if data, err := os.ReadFile(req.Exports); err == nil {
		json.Unmarshal(data, &known)
	}
	var missing []string
	for path, p := range packages {
		if p.local || path == "unsafe" || p.Dir == "" {
			continue
		}
		if file := known[exportKey(p)]; file != "" {
			if _, err := os.Stat(file); err == nil {
				p.Export = file
				continue
			}
		}
		missing = append(missing, path)
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		for _, p := range goList(append([]string{"-export", "-json=ImportPath,Export", "--"}, missing...)...) {
			if q := packages[p.ImportPath]; q != nil && p.Export != "" {
				q.Export = p.Export
				known[exportKey(q)] = p.Export
			}
		}
		if data, err := json.Marshal(known); err == nil && req.Exports != "" {
			temporary := fmt.Sprintf("%s.%d", req.Exports, os.Getpid())
			if os.WriteFile(temporary, data, 0o600) == nil {
				os.Rename(temporary, req.Exports)
			}
		}
	}
	exported = importer.ForCompiler(fset, "gc", func(path string) (io.ReadCloser, error) {
		p := packages[path]
		if p == nil || p.Export == "" {
			return nil, fmt.Errorf("no export data for %s", path)
		}
		return os.Open(p.Export)
	})
}

// The compiler rejects an import cycle; here it would make two packages wait for each other.
func cycles() {
	state := map[string]int{}
	var visit func(path string, tests bool)
	visit = func(path string, tests bool) {
		p := packages[path]
		if p == nil || !p.local || state[path] == 2 {
			return
		}
		if state[path] == 1 {
			fail("import cycle not allowed: " + path)
		}
		state[path] = 1
		needs := p.Imports
		if tests {
			needs = append(append([]string{}, needs...), p.TestImports...)
		}
		for _, next := range needs {
			if mapped := p.ImportMap[next]; mapped != "" {
				next = mapped
			}
			visit(next, false)
		}
		state[path] = 2
	}
	for path := range packages {
		visit(path, false)
	}
	byDir := map[string]*listed{}
	for _, p := range packages {
		byDir[p.Dir] = p
	}
	for _, t := range req.Targets {
		if p := byDir[t.Dir]; p != nil && t.Tests && p.local {
			state = map[string]int{}
			visit(p.ImportPath, true)
		}
	}
}

func source(file string) ([]byte, bool) {
	if replacement, ok := overlay[file]; ok {
		if replacement == "" {
			return nil, false
		}
		data, err := os.ReadFile(replacement)
		return data, err == nil
	}
	data, err := os.ReadFile(file)
	return data, err == nil
}

func report(position token.Position, message string) {
	if !position.IsValid() {
		return
	}
	outMu.Lock()
	out[diagnostic{File: position.Filename, Line: position.Line, Column: position.Column, Message: strings.SplitN(message, "\n", 2)[0]}] = true
	outMu.Unlock()
}

func parse(p *listed, names []string, full bool) []*ast.File {
	var files []*ast.File
	for _, name := range names {
		file := filepath.Join(p.Dir, name)
		data, ok := source(file)
		if !ok {
			continue
		}
		parsed, err := parser.ParseFile(fset, file, data, parser.SkipObjectResolution)
		if err != nil && full {
			var list scanner.ErrorList
			if errors.As(err, &list) {
				for _, e := range list {
					report(e.Pos, "syntax error: "+e.Msg)
				}
			}
		}
		if parsed != nil {
			files = append(files, parsed)
		}
	}
	return files
}

// Whether path imports test, directly or not.
func reaches(path, test string) bool {
	reachMu.Lock()
	defer reachMu.Unlock()
	seen := reach[test]
	if seen == nil {
		seen = map[string]bool{}
		reach[test] = seen
	}
	var visit func(string) bool
	visit = func(current string) bool {
		if found, ok := seen[current]; ok {
			return found
		}
		seen[current] = false
		p := packages[current]
		found := false
		if p != nil && p.local {
			for _, next := range p.Imports {
				if next == test || visit(next) {
					found = true
					break
				}
			}
		}
		seen[current] = found
		return found
	}
	return visit(path)
}

// Export data names its own copy of a package, which is not the one checked from source here.
func sourced(path string) string {
	if found, ok := sourcedMemo[path]; ok {
		return found
	}
	sourcedMemo[path] = ""
	p := packages[path]
	if p == nil {
		return ""
	}
	found := ""
	if p.local {
		found = path
	}
	for _, s := range p.Imports {
		if found != "" {
			break
		}
		if m := p.ImportMap[s]; m != "" {
			s = m
		}
		found = sourced(s)
	}
	sourcedMemo[path] = found
	return found
}

func (u *universe) load(path string) (*types.Package, error) {
	if path == "unsafe" {
		return types.Unsafe, nil
	}
	p := packages[path]
	if p == nil || p.Dir == "" {
		message := "cannot find package " + path
		if p != nil && p.Error != nil {
			message = p.Error.Err
		}
		return nil, errors.New(message)
	}
	if !p.local {
		exportMu.Lock()
		defer exportMu.Unlock()
		if err := exportErr[path]; err != nil {
			return nil, err
		}
		if s := sourced(path); s != "" {
			err := fmt.Errorf("dependency %s imports %s, which is checked from source", path, s)
			exportErr[path] = err
			if unavailable == "" {
				unavailable = err.Error()
			}
			return nil, err
		}
		pkg, err := exported.Import(path)
		if err != nil {
			exportErr[path] = err
			if unavailable == "" {
				unavailable = fmt.Sprintf("no export data for %s", path)
			}
		}
		return pkg, err
	}
	if u.test != "" && path != u.test && !reaches(path, u.test) {
		return base.load(path)
	}
	u.mu.Lock()
	e := u.entries[path]
	if e == nil {
		e = &entry{}
		u.entries[path] = e
	}
	u.mu.Unlock()
	e.once.Do(func() {
		names := append(append([]string{}, p.GoFiles...), p.CgoFiles...)
		if u.test == path {
			names = append(names, p.TestGoFiles...)
		}
		needs := p.Imports
		if u.test == path {
			needs = append(append([]string{}, needs...), p.TestImports...)
		}
		e.pkg, e.err = u.check(p, path, p.Name, names, needs, bodies[path])
	})
	return e.pkg, e.err
}

type imports struct {
	u    *universe
	p    *listed
	full bool
	spec map[string]token.Pos
}

func (i imports) Import(path string) (*types.Package, error) { return i.ImportFrom(path, "", 0) }
func (i imports) ImportFrom(path, _ string, _ types.ImportMode) (*types.Package, error) {
	resolved := path
	if mapped := i.p.ImportMap[path]; mapped != "" {
		resolved = mapped
	}
	// The dependency may itself need a slot to be checked.
	<-work
	pkg, err := i.u.load(resolved)
	work <- struct{}{}
	if err != nil && i.full {
		if p := packages[resolved]; p == nil || p.Dir == "" {
			report(fset.Position(i.spec[path]), err.Error())
		}
	}
	return pkg, err
}

func (u *universe) check(p *listed, path, name string, names, needs []string, full bool) (*types.Package, error) {
	var wait sync.WaitGroup
	for _, next := range needs {
		if q := packages[next]; q != nil && q.local {
			wait.Add(1)
			go func() { defer wait.Done(); u.load(next) }()
		}
	}
	wait.Wait()
	work <- struct{}{}
	defer func() { <-work }()
	files := parse(p, names, full)
	spec := map[string]token.Pos{}
	if full {
		for _, file := range files {
			for _, s := range file.Imports {
				if path, err := strconv.Unquote(s.Path.Value); err == nil {
					spec[path] = s.Path.Pos()
				}
			}
		}
	}
	version := ""
	if p.Module != nil && p.Module.GoVersion != "" {
		version = "go" + p.Module.GoVersion
	}
	config := types.Config{
		Importer:                 imports{u: u, p: p, full: full, spec: spec},
		IgnoreFuncBodies:         !full,
		FakeImportC:              true,
		GoVersion:                version,
		Sizes:                    types.SizesFor("gc", arch),
		DisableUnusedImportCheck: !full,
		Error: func(err error) {
			var e types.Error
			if full && errors.As(err, &e) && !strings.HasPrefix(e.Msg, "could not import ") {
				report(e.Fset.Position(e.Pos), e.Msg)
			}
		},
	}
	pkg, err := config.Check(path, fset, files, nil)
	if pkg == nil {
		return nil, err
	}
	return pkg, nil
}

func main() {
	if len(os.Args) != 2 {
		fail("usage: gw-go-check <request.json>")
	}
	data, err := os.ReadFile(os.Args[1])
	if err != nil || json.Unmarshal(data, &req) != nil {
		fail("unreadable request")
	}
	if req.Overlay != "" {
		var file struct{ Replace map[string]string }
		if data, err := os.ReadFile(req.Overlay); err == nil && json.Unmarshal(data, &file) == nil {
			overlay = file.Replace
		}
	}
	load()
	cycles()
	exports()
	byDir := map[string]*listed{}
	for _, p := range packages {
		if p.local {
			byDir[p.Dir] = p
		}
	}
	var wait sync.WaitGroup
	for _, t := range req.Targets {
		p := byDir[t.Dir]
		if p == nil {
			continue
		}
		bodies[p.ImportPath] = true
	}
	for _, t := range req.Targets {
		p := byDir[t.Dir]
		if p == nil {
			continue
		}
		wait.Add(1)
		go func() {
			defer wait.Done()
			if !t.Tests || len(p.TestGoFiles)+len(p.XTestGoFiles) == 0 {
				base.load(p.ImportPath)
				return
			}
			// Without its test files too: a test build also accepts a call to a helper only a test file declares.
			base.load(p.ImportPath)
			u := &universe{test: p.ImportPath, entries: map[string]*entry{}}
			u.load(p.ImportPath)
			if len(p.XTestGoFiles) > 0 {
				u.check(p, p.ImportPath+"_test", p.Name+"_test", p.XTestGoFiles, p.XTestImports, true)
			}
		}()
	}
	wait.Wait()
	result := response{Diagnostics: []diagnostic{}, Unavailable: unavailable}
	for d := range out {
		result.Diagnostics = append(result.Diagnostics, d)
	}
	sort.Slice(result.Diagnostics, func(a, b int) bool {
		x, y := result.Diagnostics[a], result.Diagnostics[b]
		if x.File != y.File {
			return x.File < y.File
		}
		if x.Line != y.Line {
			return x.Line < y.Line
		}
		if x.Column != y.Column {
			return x.Column < y.Column
		}
		return x.Message < y.Message
	})
	json.NewEncoder(os.Stdout).Encode(result)
}
`;
