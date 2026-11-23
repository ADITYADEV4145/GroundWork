import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

// Minimal JAR (zip) and class-file reader: enough to list classes and the names, argument counts and flags of
// their methods. No JVM is started and nothing is executed.

export interface JarEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  headerOffset: number;
}

export interface JarFile {
  path: string;
  entries: Map<string, JarEntry>;
}

function readAt(fd: number, position: number, length: number): Buffer {
  const buf = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const n = readSync(fd, buf, done, length - done, position + done);
    if (n <= 0) break;
    done += n;
  }
  return done === length ? buf : buf.subarray(0, done);
}

/** Read the central directory. Null for anything that is not a plain (non-zip64) archive. */
export function openJar(file: string): JarFile | null {
  let fd: number;
  try {
    fd = openSync(file, 'r');
  } catch {
    return null;
  }
  try {
    const size = fstatSync(fd).size;
    const tailLen = Math.min(size, 65557);
    const tail = readAt(fd, size - tailLen, tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return null;
    const count = tail.readUInt16LE(eocd + 10);
    const dirSize = tail.readUInt32LE(eocd + 12);
    const dirOffset = tail.readUInt32LE(eocd + 16);
    if (count === 0xffff || dirOffset === 0xffffffff || dirSize > 64 * 1024 * 1024) return null;
    const dir = readAt(fd, dirOffset, dirSize);
    const entries = new Map<string, JarEntry>();
    let p = 0;
    for (let i = 0; i < count && p + 46 <= dir.length; i++) {
      if (dir.readUInt32LE(p) !== 0x02014b50) return null;
      const method = dir.readUInt16LE(p + 10);
      const compressedSize = dir.readUInt32LE(p + 20);
      const usize = dir.readUInt32LE(p + 24);
      const nameLen = dir.readUInt16LE(p + 28);
      const extraLen = dir.readUInt16LE(p + 30);
      const commentLen = dir.readUInt16LE(p + 32);
      const headerOffset = dir.readUInt32LE(p + 42);
      const name = dir.toString('utf8', p + 46, p + 46 + nameLen);
      entries.set(name, { name, method, compressedSize, size: usize, headerOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return { path: file, entries };
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

export function readJarEntry(jar: JarFile, name: string): Buffer | null {
  const entry = jar.entries.get(name);
  if (!entry || entry.size > 16 * 1024 * 1024) return null;
  let fd: number;
  try {
    fd = openSync(jar.path, 'r');
  } catch {
    return null;
  }
  try {
    const header = readAt(fd, entry.headerOffset, 30);
    if (header.length < 30 || header.readUInt32LE(0) !== 0x04034b50) return null;
    const start = entry.headerOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    const data = readAt(fd, start, entry.compressedSize);
    if (entry.method === 0) return data;
    if (entry.method === 8) return inflateRawSync(data);
    return null;
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

export interface ClassMember {
  name: string;
  /** Number of declared parameters; varargs methods accept that many minus one, or more. */
  params: number;
  varargs: boolean;
  isStatic: boolean;
  isMethod: boolean;
  deprecated: boolean;
}

export interface ClassInfo {
  name: string;
  superName: string | null;
  interfaces: string[];
  isPublic: boolean;
  deprecated: boolean;
  members: ClassMember[];
}

/** Count the parameters in a JVM method descriptor such as `(ILjava/lang/String;[J)V`. */
export function descriptorParams(descriptor: string): number {
  let i = 1;
  let n = 0;
  while (i < descriptor.length && descriptor[i] !== ')') {
    while (descriptor[i] === '[') i++;
    if (descriptor[i] === 'L') i = descriptor.indexOf(';', i);
    if (i < 0) return n;
    i++;
    n++;
  }
  return n;
}

const ACC_PUBLIC = 0x0001;
const ACC_PRIVATE = 0x0002;
const ACC_STATIC = 0x0008;
const ACC_VARARGS = 0x0080;
const ACC_SYNTHETIC = 0x1000;

export function parseClass(buf: Buffer): ClassInfo | null {
  try {
    if (buf.readUInt32BE(0) !== 0xcafebabe) return null;
    let p = 8;
    const count = buf.readUInt16BE(p);
    p += 2;
    const utf8: (string | undefined)[] = new Array<string | undefined>(count);
    const classIndex: number[] = new Array<number>(count).fill(0);
    for (let i = 1; i < count; i++) {
      const tag = buf.readUInt8(p);
      switch (tag) {
        case 1: {
          const len = buf.readUInt16BE(p + 1);
          utf8[i] = buf.toString('utf8', p + 3, p + 3 + len);
          p += 3 + len;
          break;
        }
        case 7:
          classIndex[i] = buf.readUInt16BE(p + 1);
          p += 3;
          break;
        case 8: case 16: case 19: case 20:
          p += 3;
          break;
        case 15:
          p += 4;
          break;
        case 3: case 4: case 9: case 10: case 11: case 12: case 17: case 18:
          p += 5;
          break;
        case 5: case 6:
          p += 9;
          i++;
          break;
        default:
          return null;
      }
    }
    const className = (index: number): string | null => (index ? utf8[classIndex[index]!] ?? null : null);
    const access = buf.readUInt16BE(p);
    const name = className(buf.readUInt16BE(p + 2));
    const superName = className(buf.readUInt16BE(p + 4));
    p += 6;
    const interfaceCount = buf.readUInt16BE(p);
    p += 2;
    const interfaces: string[] = [];
    for (let i = 0; i < interfaceCount; i++, p += 2) {
      const n = className(buf.readUInt16BE(p));
      if (n) interfaces.push(n);
    }
    if (!name) return null;
    const members: ClassMember[] = [];
    const attributes = (): boolean => {
      let deprecated = false;
      const n = buf.readUInt16BE(p);
      p += 2;
      for (let i = 0; i < n; i++) {
        if (utf8[buf.readUInt16BE(p)] === 'Deprecated') deprecated = true;
        p += 6 + buf.readUInt32BE(p + 2);
      }
      return deprecated;
    };
    for (const isMethod of [false, true]) {
      const n = buf.readUInt16BE(p);
      p += 2;
      for (let i = 0; i < n; i++) {
        const flags = buf.readUInt16BE(p);
        const memberName = utf8[buf.readUInt16BE(p + 2)] ?? '';
        const descriptor = utf8[buf.readUInt16BE(p + 4)] ?? '';
        p += 6;
        const deprecated = attributes();
        if (flags & (ACC_PRIVATE | ACC_SYNTHETIC) || memberName === '<clinit>') continue;
        members.push({
          name: memberName, isMethod, params: isMethod ? descriptorParams(descriptor) : 0,
          varargs: isMethod && (flags & ACC_VARARGS) !== 0, isStatic: (flags & ACC_STATIC) !== 0, deprecated,
        });
      }
    }
    const deprecated = attributes();
    return { name, superName, interfaces, isPublic: (access & ACC_PUBLIC) !== 0, deprecated, members };
  } catch {
    return null;
  }
}
