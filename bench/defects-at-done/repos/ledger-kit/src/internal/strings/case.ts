/** Lowercases, strips accents and joins words with single dashes: "Ünited  Parcel, Inc." -> "united-parcel-inc". */
export function kebabize(input: string): string {
  return input.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
/** Uppercases the first letter of each word. */
export function titleize(input: string): string {
  return input.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
