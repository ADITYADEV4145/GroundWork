// @generated
export function generatedDateParser(value: string): Date {
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) throw new Error('bad date');
  return result;
}
