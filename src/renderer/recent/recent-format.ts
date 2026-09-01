function timeLabel(value: Date): string {
  return `${String(value.getHours()).padStart(2, '0')}:${String(
    value.getMinutes(),
  ).padStart(2, '0')}`;
}

export function formatRecentTimestamp(
  timestamp: number,
  now = Date.now(),
): string {
  const value = new Date(timestamp);
  const current = new Date(now);
  const today = new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate(),
  );
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const time = timeLabel(value);

  if (timestamp >= today.getTime() && timestamp < tomorrow.getTime()) {
    return `今天 ${time}`;
  }
  if (timestamp >= yesterday.getTime() && timestamp < today.getTime()) {
    return `昨天 ${time}`;
  }
  return `${value.getMonth() + 1}月${value.getDate()}日 ${time}`;
}
