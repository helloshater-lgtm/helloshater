/**
 * Excel-friendly CSV: UTF-8 BOM (Arabic shows correctly in Excel), CRLF lines,
 * quoted cells, and protection against formula injection (=, +, -, @).
 */
export type CsvColumn<T> = { header: string; value: (row: T) => string | number | boolean | null | undefined };

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'boolean' ? (value ? 'نعم' : 'لا') : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(c.value(row))).join(','));
  return '﻿' + lines.join('\r\n');
}

export function csvFileName(base: string, now: Date = new Date()): string {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(now);
  return `shatir-${base}-${d}.csv`;
}

export function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
