export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsv<T extends object>(
  rows: T[],
  columns: { key: keyof T; header: string }[]
): string {
  const header = columns.map((column) => csvEscape(column.header)).join(',');
  const lines = rows.map((row) =>
    columns.map((column) => csvEscape(row[column.key] as string | number | null | undefined)).join(',')
  );
  return [header, ...lines].join('\n');
}
