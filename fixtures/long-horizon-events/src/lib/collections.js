import { positiveInteger } from './validation.js';

export function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function paginate(items, page = 1, pageSize = 10) {
  positiveInteger(page);
  positiveInteger(pageSize);
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length,
    page, pageSize, totalPages: Math.ceil(items.length / pageSize) };
}
