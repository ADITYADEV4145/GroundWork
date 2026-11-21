// Handwritten reference changes used only to exercise the evaluator, never capture evidence.
export const good = [
  ['event-card', `import { slugify } from '../lib/text.js';
import { formatDate } from '../lib/date.js';
export function createEventCard(event) {
  const title = event.title.trim();
  if (!title) throw new TypeError('Empty title');
  return { id: slugify(title), title, dateLabel: formatDate(event.startsAt) };
}
`],
  ['invitation', `import { createEventCard } from './event-card.js';
import { normalizeEmail } from '../lib/validation.js';
export function buildInvitation(event, guest) {
  const card = createEventCard(event);
  return { to: normalizeEmail(guest.email), subject: 'Invitation: ' + card.title, url: '/events/' + card.id };
}
`],
  ['agenda', `import { createEventCard } from './event-card.js';
export function buildAgenda(events) {
  return [...events].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)).map(createEventCard);
}
`],
  ['reminders', `import { buildInvitation } from './invitation.js';
import { retry } from '../lib/retry.js';
export async function sendReminder(event, guest, deliver) {
  const invitation = buildInvitation(event, guest);
  return retry(() => deliver(invitation), 3);
}
`],
  ['roster', `import { normalizeEmail } from '../lib/validation.js';
import { uniqueBy } from '../lib/collections.js';
export function buildRoster(signups) {
  const normalized = signups.map((s) => ({ name: s.name.trim(), email: normalizeEmail(s.email) }));
  return uniqueBy(normalized, (s) => s.email).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}
`],
  ['attendance', `import { buildRoster } from './roster.js';
import { positiveInteger } from '../lib/validation.js';
export function summarizeAttendance(event, signups) {
  const capacity = positiveInteger(event.capacity);
  const count = buildRoster(signups).length;
  return { confirmed: Math.min(count, capacity), remaining: Math.max(capacity - count, 0), waitlisted: Math.max(count - capacity, 0) };
}
`],
  ['export', `import { createEventCard } from './event-card.js';
import { buildRoster } from './roster.js';
import { csvCell } from '../lib/text.js';
export function exportRosterCsv(event, signups) {
  const card = createEventCard(event);
  const rows = buildRoster(signups).map((s) => [card.title, card.dateLabel, s.name, s.email].map(csvCell).join(','));
  return ['event,date,name,email', ...rows].join('\\n') + '\\n';
}
`],
  ['digest', `import { buildAgenda } from './agenda.js';
import { summarizeAttendance } from './attendance.js';
export function buildOrganizerDigest(events, signupsByEvent) {
  const ordered = [...events].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  return buildAgenda(events).map((card, i) => ({ ...card, ...summarizeAttendance(ordered[i], signupsByEvent[card.id] ?? []) }));
}
`],
  ['delivery', `import { buildOrganizerDigest } from './digest.js';
import { normalizeEmail } from '../lib/validation.js';
import { retry } from '../lib/retry.js';
export async function deliverDigest(events, signupsByEvent, organizer, send) {
  const to = normalizeEmail(organizer.email);
  const digest = buildOrganizerDigest(events, signupsByEvent);
  const payload = { to, subject: 'Event digest', eventIds: digest.map((item) => item.id), totalConfirmed: digest.reduce((sum, item) => sum + item.confirmed, 0) };
  return retry(() => send(payload), 3);
}
`],
  ['dashboard', `import { buildOrganizerDigest } from './digest.js';
import { paginate } from '../lib/collections.js';
export function buildDashboard(events, signupsByEvent, query = {}) {
  const search = (query.search ?? '').trim().toLowerCase();
  const matching = buildOrganizerDigest(events, signupsByEvent).filter((item) => item.title.toLowerCase().includes(search));
  return paginate(matching, query.page ?? 1, query.pageSize ?? 10);
}
`],
];
