export function partitionRecords(records: number[]): Map<boolean, number[]> {
  const groups = new Map<boolean, number[]>();
  for (const record of records) {
    const key = record % 2 === 0;
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  return groups;
}
