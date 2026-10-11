// SQL literal helpers for the generator scripts. Only used for trusted, validated values.
export function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function insert(table, row) {
  const columns = Object.keys(row);
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((c) => sqlValue(row[c])).join(', ')});`;
}
