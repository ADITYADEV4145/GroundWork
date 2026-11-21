import { slugify } from './lib/text.js';
import { formatDate } from './lib/date.js';

export function preview(event) {
  return `${slugify(event.title)} on ${formatDate(event.startsAt)}`;
}
