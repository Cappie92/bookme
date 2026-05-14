/**
 * Ссылка «Добавить в Google Календарь» без .ics (удобнее на Android, чем share sheet с файлом).
 * @see https://calendar.google.com/calendar/render?action=TEMPLATE&...
 */
export function buildGoogleCalendarTemplateUrl(opts: {
  title: string;
  startIso: string;
  endIso: string;
  details?: string;
  location?: string;
}): string {
  const start = new Date(opts.startIso);
  const end = new Date(opts.endIso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const toG = (d: Date) => {
    if (Number.isNaN(d.getTime())) return '';
    return (
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
      `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
    );
  };
  const dates = `${toG(start)}/${toG(end)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: opts.title,
    dates,
  });
  if (opts.details?.trim()) params.set('details', opts.details.trim());
  if (opts.location?.trim()) params.set('location', opts.location.trim());
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
