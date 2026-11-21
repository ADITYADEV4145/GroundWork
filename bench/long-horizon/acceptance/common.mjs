import { pathToFileURL } from 'node:url';
import path from 'node:path';
export { default as assert } from 'node:assert/strict';
export const feature = (name) => import(pathToFileURL(path.join(process.cwd(), `src/features/${name}.js`)).href);
export const event = Object.freeze({ title: '  Café & Code!  ', startsAt: '2026-04-02T23:30:00-05:00', capacity: 2 });
export const guest = Object.freeze({ name: 'Ada', email: ' ADA@Example.COM ' });
export const signups = Object.freeze([
  Object.freeze({ name: ' Zoe ', email: 'ZOE@EXAMPLE.COM' }),
  Object.freeze({ name: ' Ada ', email: 'ada@example.com' }),
  Object.freeze({ name: 'Ignored', email: ' ADA@example.com ' }),
]);
export const card = { id: 'cafe-code', title: 'Café & Code!', dateLabel: '2026-04-03' };
export const broken = { ...event, startsAt: 'not-a-date' };
