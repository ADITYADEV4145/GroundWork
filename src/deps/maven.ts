import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openJar, parseClass, readJarEntry, type ClassInfo, type JarFile } from './jar.js';
import type { Arity, ExportInfo, ModuleSurface, PackageRef } from './surface.js';

// Maven/Gradle surface: classes and their methods, read from the JARs a build file declares, found in the local
// repository (`~/.m2`), the Gradle cache, or a `lib(s)/` directory. Neither Maven nor Gradle is run.

export interface MavenCoordinate {
  group: string;
  artifact: string;
  version: string;
}

function read(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function tag(xml: string, name: string): string | null {
  return new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`).exec(xml)?.[1] ?? null;
}

/** Dependencies a pom.xml declares with a concrete version (after `${property}` substitution). */
export function pomDependencies(pom: string, inherited: Map<string, string> = new Map()): { deps: MavenCoordinate[]; modules: string[]; properties: Map<string, string> } {
  const xml = pom.replace(/<!--[\s\S]*?-->/g, '');
  const properties = new Map(inherited);
  const props = /<properties>([\s\S]*?)<\/properties>/.exec(xml)?.[1] ?? '';
  for (const m of props.matchAll(/<([\w.-]+)>\s*([^<]*?)\s*<\/\1>/g)) properties.set(m[1]!, m[2]!);
  const head = xml.replace(/<(dependencies|dependencyManagement|build|profiles|parent)>[\s\S]*?<\/\1>/g, '');
  const projectVersion = tag(head, 'version') ?? tag(/<parent>([\s\S]*?)<\/parent>/.exec(xml)?.[1] ?? '', 'version');
  if (projectVersion) properties.set('project.version', projectVersion);
  const subst = (v: string | null): string | null => v?.replace(/\$\{([^}]+)\}/g, (all, k: string) => properties.get(k) ?? all) ?? null;
  const managed = new Map<string, string>();
  const collect = (block: string): MavenCoordinate[] => {
    const out: MavenCoordinate[] = [];
    for (const m of block.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
      const group = subst(tag(m[1]!, 'groupId'));
      const artifact = subst(tag(m[1]!, 'artifactId'));
      const version = subst(tag(m[1]!, 'version')) ?? (group && artifact ? managed.get(`${group}:${artifact}`) ?? null : null);
      if (group && artifact && version && !version.includes('${') && !/[[(,]/.test(version)) out.push({ group, artifact, version });
    }
    return out;
  };
  const management = /<dependencyManagement>([\s\S]*?)<\/dependencyManagement>/.exec(xml)?.[1] ?? '';
  for (const d of collect(management)) managed.set(`${d.group}:${d.artifact}`, d.version);
  const deps = collect(xml.replace(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/g, '').replace(/<(build|profiles)>[\s\S]*?<\/\1>/g, ''));
  const modules = [...(/<modules>([\s\S]*?)<\/modules>/.exec(xml)?.[1] ?? '').matchAll(/<module>\s*([^<]+?)\s*<\/module>/g)].map((m) => m[1]!);
  return { deps, modules, properties };
}

export function gradleDependencies(text: string): MavenCoordinate[] {
  const out: MavenCoordinate[] = [];
  const body = text.replace(/\/\/.*$/gm, '');
  for (const m of body.matchAll(/["']([\w.-]+):([\w.-]+):([\w.+-]+)(?:@\w+)?["']/g)) out.push({ group: m[1]!, artifact: m[2]!, version: m[3]! });
  for (const m of body.matchAll(/group\s*[:=]\s*["']([\w.-]+)["']\s*,\s*name\s*[:=]\s*["']([\w.-]+)["']\s*,\s*version\s*[:=]\s*["']([\w.+-]+)["']/g)) {
    out.push({ group: m[1]!, artifact: m[2]!, version: m[3]! });
  }
  return out;
}

function jarFor(c: MavenCoordinate): string | null {
  const home = os.homedir();
  const m2 = process.env.GROUNDWORK_M2 ?? path.join(home, '.m2', 'repository');
  const direct = path.join(m2, ...c.group.split('.'), c.artifact, c.version, `${c.artifact}-${c.version}.jar`);
  if (existsSync(direct)) return direct;
  const gradle = path.join(process.env.GRADLE_USER_HOME ?? path.join(home, '.gradle'), 'caches', 'modules-2', 'files-2.1', c.group, c.artifact, c.version);
  try {
    for (const hash of readdirSync(gradle)) {
      const jar = path.join(gradle, hash, `${c.artifact}-${c.version}.jar`);
      if (existsSync(jar)) return jar;
    }
  } catch {
    // not in the Gradle cache
  }
  return null;
}

export interface JavaProject {
  /** Directory of the build file that governs the checked file. */
  dir: string;
  jars: { ref: PackageRef; jar: JarFile }[];
  /** Declared dependencies whose JAR is not on this machine. */
  missing: number;
  /** package (dotted) -> jars that contain it. */
  packages: Map<string, number[]>;
}

const projects = new Map<string, JavaProject | null>();

function buildDirFor(root: string, relFile: string): string | null {
  let dir = path.dirname(path.resolve(root, relFile));
  for (;;) {
    if (['pom.xml', 'build.gradle', 'build.gradle.kts'].some((f) => existsSync(path.join(dir, f)))) return dir;
    if (dir === root || path.dirname(dir) === dir) return null;
    dir = path.dirname(dir);
  }
}

/** Properties and managed versions a module inherits from parent poms inside the repo. */
function inheritedProperties(root: string, dir: string): Map<string, string> {
  const chain: string[] = [];
  let d = path.dirname(dir);
  while (d.startsWith(root) && chain.length < 6) {
    if (existsSync(path.join(d, 'pom.xml'))) chain.unshift(d);
    if (d === root || path.dirname(d) === d) break;
    d = path.dirname(d);
  }
  let props = new Map<string, string>();
  for (const p of chain) props = pomDependencies(read(path.join(p, 'pom.xml')) ?? '', props).properties;
  return props;
}

export function resetJavaProjects(): void {
  projects.clear();
}

export function javaProject(root: string, relFile: string): JavaProject | null {
  const dir = buildDirFor(root, relFile);
  if (!dir) return null;
  const cached = projects.get(dir);
  if (cached !== undefined) return cached;
  const coords: MavenCoordinate[] = [];
  const pom = read(path.join(dir, 'pom.xml'));
  if (pom !== null) coords.push(...pomDependencies(pom, inheritedProperties(root, dir)).deps);
  for (const f of ['build.gradle', 'build.gradle.kts']) {
    const text = read(path.join(dir, f));
    if (text !== null) coords.push(...gradleDependencies(text));
  }
  const project: JavaProject = { dir, jars: [], missing: 0, packages: new Map() };
  const seen = new Set<string>();
  const addJar = (file: string, ref: Omit<PackageRef, 'location' | 'ecosystem'>): void => {
    if (seen.has(file)) return;
    seen.add(file);
    const jar = openJar(file);
    if (!jar) {
      project.missing++;
      return;
    }
    const index = project.jars.length;
    project.jars.push({ ref: { ecosystem: 'maven', ...ref, location: file }, jar });
    const pkgs = new Set<string>();
    for (const name of jar.entries.keys()) {
      if (!name.endsWith('.class') || name.startsWith('META-INF/')) continue;
      pkgs.add(name.slice(0, Math.max(0, name.lastIndexOf('/'))).replaceAll('/', '.'));
    }
    for (const pkg of pkgs) project.packages.set(pkg, [...(project.packages.get(pkg) ?? []), index]);
  };
  for (const c of coords) {
    const file = jarFor(c);
    if (file) addJar(file, { name: `${c.group}:${c.artifact}`, version: c.version });
    else project.missing++;
  }
  for (const lib of ['lib', 'libs']) {
    try {
      for (const f of readdirSync(path.join(dir, lib))) {
        if (!f.endsWith('.jar')) continue;
        const m = /^(.*?)-(\d[\w.+-]*)\.jar$/.exec(f);
        const file = path.join(dir, lib, f);
        addJar(file, { name: m?.[1] ?? f.slice(0, -4), version: m?.[2] ?? String(statSync(file).mtimeMs) });
      }
    } catch {
      // no such directory
    }
  }
  const result = project.jars.length ? project : null;
  projects.set(dir, result);
  return result;
}

export interface JavaClassHit {
  ref: PackageRef;
  /** Simple names of the public top-level classes in the same package, across every located JAR. */
  siblings: string[];
  /** Null when the package exists and the class does not. */
  info: ClassInfo | null;
  jarIndex: number;
}

/** Look a class up. Null when no located JAR owns the package, i.e. nothing is known. */
export function findJavaClass(project: JavaProject, pkg: string, simpleName: string): JavaClassHit | null {
  const owners = project.packages.get(pkg);
  if (!owners?.length) return null;
  const entry = `${pkg.replaceAll('.', '/')}/${simpleName}.class`;
  const siblings = new Set<string>();
  for (const i of owners) {
    const prefix = `${pkg.replaceAll('.', '/')}/`;
    for (const name of project.jars[i]!.jar.entries.keys()) {
      if (!name.startsWith(prefix) || !name.endsWith('.class')) continue;
      const simple = name.slice(prefix.length, -6);
      if (!simple.includes('/') && !simple.includes('$') && simple !== 'package-info' && simple !== 'module-info') siblings.add(simple);
    }
  }
  for (const i of owners) {
    const { jar, ref } = project.jars[i]!;
    if (!jar.entries.has(entry)) continue;
    const buf = readJarEntry(jar, entry);
    const info = buf ? parseClass(buf) : null;
    if (!info) return null;
    return { ref, siblings: [...siblings], info, jarIndex: i };
  }
  return { ref: project.jars[owners[0]!]!.ref, siblings: [...siblings], info: null, jarIndex: owners[0]! };
}

function loadClass(project: JavaProject, internalName: string): ClassInfo | null {
  const entry = `${internalName}.class`;
  for (const { jar } of project.jars) {
    if (!jar.entries.has(entry)) continue;
    const buf = readJarEntry(jar, entry);
    return buf ? parseClass(buf) : null;
  }
  return null;
}

/** Members callable through a class name, including those inherited from classes in the located JARs. */
export function javaClassSurface(project: JavaProject, info: ClassInfo): ModuleSurface {
  const exports: Record<string, ExportInfo> = {};
  const arities = new Map<string, Arity[]>();
  const deprecated = new Map<string, boolean>();
  let open = false;
  let why: string | undefined;
  const seen = new Set<string>();
  const visit = (c: ClassInfo, depth: number): void => {
    if (seen.has(c.name) || depth > 12) return;
    seen.add(c.name);
    for (const m of c.members) {
      if (m.name === '<init>' && depth > 0) continue;
      const name = m.name === '<init>' ? 'new' : m.name;
      exports[name] ??= { kind: m.isMethod ? 'function' : 'value' };
      if (m.isMethod) {
        arities.set(name, [...(arities.get(name) ?? []), m.varargs ? [Math.max(0, m.params - 1), null] : [m.params, m.params]]);
        deprecated.set(name, (deprecated.get(name) ?? true) && m.deprecated);
      }
    }
    for (const parent of [c.superName, ...c.interfaces]) {
      if (!parent || parent === 'java/lang/Object') continue;
      const loaded = loadClass(project, parent);
      if (loaded) visit(loaded, depth + 1);
      else {
        // A parent in the JDK or in a JAR that is not here: inherited members cannot be listed.
        open = true;
        why ??= `extends ${parent.replaceAll('/', '.')}, which is not in a located JAR`;
      }
    }
  };
  visit(info, 0);
  for (const [name, list] of arities) {
    exports[name]!.arities = list;
    if (deprecated.get(name)) exports[name]!.deprecated = '';
  }
  return { exports, open, ...(why ? { why } : {}) };
}
