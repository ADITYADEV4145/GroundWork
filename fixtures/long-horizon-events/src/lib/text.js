export function slugify(value) {
  const normalized = String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const words = normalized.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
  return words.replace(/^-+|-+$/g, '');
}

export function csvCell(value) {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}
