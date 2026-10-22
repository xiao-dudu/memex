function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseLocalDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('日期格式无效');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error('日期无效');
  }
  return date;
}

export function formatLocalDateInput(timestamp: number): string {
  return formatDateInput(new Date(timestamp));
}

export function defaultReportPeriod(now: Date): { start: string; end: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(today);
  start.setDate(start.getDate() - 6);
  return { start: formatDateInput(start), end: formatDateInput(today) };
}

export function localDayStart(value: string): number {
  return parseLocalDate(value).getTime();
}

export function localDayEndExclusive(value: string): number {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + 1);
  return date.getTime();
}

export function displayEndDate(periodEnd: number): string {
  return formatDateInput(new Date(periodEnd - 1));
}

