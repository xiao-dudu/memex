export function formatDue(value: number | null): string {
  if (!value) return '';
  const date = new Date(value);
  const today = new Date();
  const sameYear = date.getFullYear() === today.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${sameYear ? '' : `${date.getFullYear()}年`}${month}月${day}日 ${time}`;
}

export function formatShortDate(value: number | null): string {
  if (!value) return '';
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function isOverdue(value: number | null, status: string): boolean {
  return value !== null && status !== 'done' && value < Date.now();
}

export function toDateTimeInput(value: number | null): string {
  if (!value) return '';
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDateTimeInput(value: string): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function relativeTime(value: number): string {
  const diff = Date.now() - value;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  const date = new Date(value);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
