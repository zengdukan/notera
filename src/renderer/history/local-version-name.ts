const twoDigits = (value: number) => value.toString().padStart(2, '0');

export function localVersionName(date: Date): string {
  return [
    date.getFullYear(),
    '-',
    twoDigits(date.getMonth() + 1),
    '-',
    twoDigits(date.getDate()),
    ' ',
    twoDigits(date.getHours()),
    ':',
    twoDigits(date.getMinutes()),
    ':',
    twoDigits(date.getSeconds()),
  ].join('');
}
