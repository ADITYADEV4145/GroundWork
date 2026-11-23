import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Dependency surface (checking beyond the repo): the public API of an installed package, read from local type
// definitions and metadata only. Never the network. A surface is cached per package version, so a lockfile bump
// rebuilds exactly the packages that changed.

export type Ecosystem = 'npm' | 'pypi' | 'go' | 'maven' | 'cargo';

/** Inclusive argument-count range of one overload; `null` max means variadic. */
export type Arity = [min: number, max: number | null];

export interface ExportInfo {
  kind: 'function' | 'class' | 'value' | 'type' | 'namespace';
  /** Every callable overload. Absent when the call shape is not known for sure. */
  arities?: Arity[];
  signature?: string;
  /** Set when every declaration is marked deprecated; the text is the package's own note. */
  deprecated?: string;
  /** One level of members (`_.merge`, `Objects.requireNonNull`). `null`: members exist but cannot be listed. */
  members?: Record<string, ExportInfo> | null;
}

export interface ModuleSurface {
  exports: Record<string, ExportInfo>;
  /** True when a missing name proves nothing (dynamic exports, native code, untyped JavaScript). */
  open: boolean;
  why?: string;
  /** Name the package declares for itself (Go: the identifier an un-aliased import binds). */
  name?: string;
  /** Identifiers the module's source mentions without a listed definition: such a name is never proven missing. */
  mentions?: string[];
  /** Other packages this listing was read from (`package.json` path -> version); the cache entry dies when one changes. */
  via?: Record<string, string>;
}

export interface PackageRef {
  ecosystem: Ecosystem;
  name: string;
  version: string;
  /** Absolute directory or archive the surface was read from. */
  location: string;
}

export const SURFACE_FORMAT = 2;

function cacheFile(root: string, ref: PackageRef, module: string): string {
  const safe = (s: string) => s.replace(/[^\w.@+-]+/g, '_').slice(0, 120);
  return path.join(root, '.groundwork', 'deps', ref.ecosystem, `${safe(ref.name)}@${safe(ref.version)}`, `${safe(module) || '_'}.json`);
}

interface Stored { format: number; location: string; surface: ModuleSurface }

export function readCachedSurface(root: string, ref: PackageRef, module: string): ModuleSurface | null {
  try {
    const stored = JSON.parse(readFileSync(cacheFile(root, ref, module), 'utf8')) as Stored;
    if (stored.format !== SURFACE_FORMAT || stored.location !== ref.location) return null;
    for (const [manifest, version] of Object.entries(stored.surface.via ?? {})) {
      if (String((JSON.parse(readFileSync(manifest, 'utf8')) as { version?: unknown }).version ?? '') !== version) return null;
    }
    return stored.surface;
  } catch {
    return null;
  }
}

export function writeCachedSurface(root: string, ref: PackageRef, module: string, surface: ModuleSurface): void {
  try {
    // Never create `.groundwork` in a directory that is not an initialised repo.
    if (!existsSync(path.join(root, '.groundwork'))) return;
    const file = cacheFile(root, ref, module);
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ format: SURFACE_FORMAT, location: ref.location, surface } satisfies Stored));
    renameSync(tmp, file);
  } catch {
    // The cache is an optimisation: a read-only checkout still checks, just slower.
  }
}

export function arityAllows(arities: Arity[], argCount: number): boolean {
  return arities.some(([min, max]) => argCount >= min && (max === null || argCount <= max));
}

export function arityText(arities: Arity[]): string {
  const min = Math.min(...arities.map((a) => a[0]));
  const open = arities.some((a) => a[1] === null);
  const max = open ? null : Math.max(...arities.map((a) => a[1]!));
  if (max === null) return `at least ${min}`;
  return min === max ? `${min}` : `${min}-${max}`;
}

/** `4.17.21` -> `v4.17`: enough for the agent to know which API it is looking at. */
export function shortVersion(version: string): string {
  const m = /^v?(\d+)\.(\d+)/.exec(version);
  return m ? `v${m[1]}.${m[2]}` : version.startsWith('v') ? version : `v${version}`;
}
