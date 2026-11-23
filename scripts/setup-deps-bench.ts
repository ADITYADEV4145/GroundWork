// Dev-only setup for bench/deps: downloads the pinned packages into an external cache. Not shipped with the tool.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const spec = JSON.parse(readFileSync(path.join(here, '..', 'bench', 'deps', 'cases.json'), 'utf8')) as { packages: Record<string, Record<string, string>> };
export const CACHE = process.env.GROUNDWORK_DEPS_BENCH ?? path.join(os.homedir(), '.cache', 'groundwork-bench', 'deps');
const project = path.join(CACHE, 'project');
const run = (cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): void => {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
};

mkdirSync(project, { recursive: true });
writeFileSync(path.join(project, '.gitignore'), 'node_modules/\n.venv/\n.groundwork/\nout/\n');
if (!existsSync(path.join(project, '.git'))) run('git', ['init', '-q'], project);

// npm
writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'deps-bench', private: true, type: 'module', dependencies: spec.packages.npm }, null, 1));
writeFileSync(path.join(project, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'es2022', module: 'nodenext', moduleResolution: 'nodenext', strict: true, esModuleInterop: true, skipLibCheck: true, noEmit: true } }, null, 1));
run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts'], project);

// PyPI
if (!existsSync(path.join(project, '.venv'))) run('python3', ['-m', 'venv', '.venv'], project);
run(path.join(project, '.venv', 'bin', 'pip'), ['install', '-q', ...Object.entries(spec.packages.pypi!).map(([n, v]) => `${n}==${v}`)], project);

// Go
writeFileSync(path.join(project, 'go.mod'), `module bench\n\ngo 1.21\n\nrequire (\n${Object.entries(spec.packages.go!).map(([n, v]) => `\t${n} ${v}`).join('\n')}\n)\n`);
mkdirSync(path.join(project, 'internal', 'keep'), { recursive: true });
writeFileSync(path.join(project, 'internal', 'keep', 'keep.go'), `package keep\n\nimport (\n${Object.keys(spec.packages.go!).map((n) => `\t_ "${n}"`).join('\n')}\n)\n`);
run('go', ['mod', 'tidy'], project);

// Maven: JARs straight from Maven Central into a private repository layout.
const m2 = path.join(CACHE, 'm2');
const fetchTo = async (url: string, file: string): Promise<void> => {
  if (existsSync(file)) return;
  console.log(`GET ${url}`);
  let res = await fetch(url, { headers: { 'user-agent': 'groundwork-bench-setup' } });
  for (let attempt = 0; res.status === 429 && attempt < 4; attempt++) {
    await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    res = await fetch(url, { headers: { 'user-agent': 'groundwork-bench-setup' } });
  }
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
};
const deps: string[] = [];
for (const [coordinate, version] of Object.entries(spec.packages.maven!)) {
  const [group, artifact] = coordinate.split(':') as [string, string];
  const rel = `${group.replaceAll('.', '/')}/${artifact}/${version}/${artifact}-${version}.jar`;
  await fetchTo(`https://repo1.maven.org/maven2/${rel}`, path.join(m2, rel));
  deps.push(`<dependency><groupId>${group}</groupId><artifactId>${artifact}</artifactId><version>${version}</version></dependency>`);
}
writeFileSync(path.join(project, 'pom.xml'), `<project><modelVersion>4.0.0</modelVersion><groupId>bench</groupId><artifactId>deps</artifactId><version>1</version>\n<dependencies>\n${deps.join('\n')}\n</dependencies></project>\n`);

// Control corpora: real code that builds against the same installed packages.
const control = path.join(project, 'control');
const site = path.join(project, '.venv', 'lib', readdirSync(path.join(project, '.venv', 'lib'))[0]!, 'site-packages');
// The Python sources live in a repo of their own: inside the case project they would shadow the installed
// packages of the same name (v1 of this gate made that mistake, see bench/deps/PREREGISTRATION-v2.md).
rmSync(path.join(control, 'py'), { recursive: true, force: true });
const controlPy = path.join(CACHE, 'control-py');
mkdirSync(controlPy, { recursive: true });
writeFileSync(path.join(controlPy, '.gitignore'), '.venv\n.groundwork/\n');
if (!existsSync(path.join(controlPy, '.git'))) run('git', ['init', '-q'], controlPy);
if (!existsSync(path.join(controlPy, '.venv'))) symlinkSync(path.join(project, '.venv'), path.join(controlPy, '.venv'));
for (const pkg of ['requests', 'click', 'jinja2']) {
  // Copied under their own names so their intra-package imports resolve inside the repo.
  cpSync(path.join(site, pkg), path.join(controlPy, pkg), { recursive: true });
}
const goCache = execFileSync('go', ['env', 'GOMODCACHE'], { encoding: 'utf8' }).trim();
for (const [mod, version] of Object.entries(spec.packages.go!)) {
  const dest = path.join(control, 'go', path.basename(mod));
  if (existsSync(dest)) continue;
  cpSync(path.join(goCache, `${mod}@${version}`), dest, { recursive: true });
  run('chmod', ['-R', 'u+w', dest], project);
}
const textVersion = Object.values(spec.packages.control!)[0]!;
const sources = path.join(CACHE, `commons-text-${textVersion}-sources.jar`);
await fetchTo(`https://repo1.maven.org/maven2/org/apache/commons/commons-text/${textVersion}/commons-text-${textVersion}-sources.jar`, sources);
const javaControl = path.join(control, 'java', 'commons-text');
if (!existsSync(javaControl)) {
  mkdirSync(path.join(javaControl, 'src', 'main', 'java'), { recursive: true });
  run('unzip', ['-q', '-o', sources, '-d', path.join(javaControl, 'src', 'main', 'java')], project);
  writeFileSync(path.join(javaControl, 'pom.xml'), `<project><modelVersion>4.0.0</modelVersion><groupId>bench</groupId><artifactId>text</artifactId><version>1</version>\n<dependencies>\n${deps[1]}\n</dependencies></project>\n`);
}

// Timing project: at least 500 installed npm packages.
const timing = path.join(CACHE, 'timing');
mkdirSync(timing, { recursive: true });
writeFileSync(path.join(timing, '.gitignore'), 'node_modules/\n.groundwork/\n');
writeFileSync(path.join(timing, 'package.json'), JSON.stringify({ name: 'deps-timing', private: true, dependencies: spec.packages.timing }, null, 1));
if (!existsSync(path.join(timing, '.git'))) run('git', ['init', '-q'], timing);
run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', '--legacy-peer-deps'], timing);
console.log(`ready: ${CACHE}`);
