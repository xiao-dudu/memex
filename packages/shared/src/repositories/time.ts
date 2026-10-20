export function getDayRange(now = Date.now()): { start: number; end: number } {
  const startDate = new Date(now);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);
  return { start: startDate.getTime(), end: endDate.getTime() };
}

export function futureRange(days: number, now = Date.now()): { start: number; end: number } {
  const { end } = getDayRange(now);
  return { start: end, end: end + days * 24 * 60 * 60 * 1000 };
}
