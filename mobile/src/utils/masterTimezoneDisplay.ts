/**
 * Строка часового пояса мастера для карточки публичной записи (без «живых» часов).
 * Пример: «Москва (GMT+3)» или «МСК (GMT+3)».
 */

const RU_IANA_LABEL: Record<string, string> = {
  'Europe/Kaliningrad': 'Калининград',
  'Europe/Moscow': 'Москва',
  'Europe/Samara': 'Самара',
  'Europe/Volgograd': 'Волгоград',
  'Europe/Saratov': 'Саратов',
  'Europe/Ulyanovsk': 'Ульяновск',
  'Europe/Astrakhan': 'Астрахань',
  'Asia/Yekaterinburg': 'Екатеринбург',
  'Asia/Omsk': 'Омск',
  'Asia/Novosibirsk': 'Новосибирск',
  'Asia/Barnaul': 'Барнаул',
  'Asia/Tomsk': 'Томск',
  'Asia/Novokuznetsk': 'Новокузнецк',
  'Asia/Krasnoyarsk': 'Красноярск',
  'Asia/Irkutsk': 'Иркутск',
  'Asia/Chita': 'Чита',
  'Asia/Yakutsk': 'Якутск',
  'Asia/Vladivostok': 'Владивосток',
  'Asia/Magadan': 'Магадан',
  'Asia/Kamchatka': 'Петропавловск-Камчатский',
  'Asia/Sakhalin': 'Южно-Сахалинск',
};

function gmtOffsetLabel(iana: string, at: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: iana,
      timeZoneName: 'shortOffset',
    }).formatToParts(at);
    const raw = parts.find((p) => p.type === 'timeZoneName')?.value?.trim() ?? '';
    if (!raw) return '';
    if (/^gmt/i.test(raw)) return raw.toUpperCase();
    if (raw.startsWith('+') || raw.startsWith('-')) return `GMT${raw}`;
    return raw;
  } catch {
    return '';
  }
}

/**
 * @param abbrev Короткая метка (МСК и т.п.) из существующего маппинга экрана.
 */
export function buildMasterTimezoneDisplayLine(
  iana: string | null | undefined,
  abbrev: string
): string {
  const z = (iana || '').trim();
  if (!z) return 'Местное время не указано';

  const now = new Date();
  let gmt: string;
  try {
    gmt = gmtOffsetLabel(z, now);
  } catch {
    return abbrev.trim() || z;
  }

  const city = RU_IANA_LABEL[z];
  if (city && gmt) return `${city} (${gmt})`;
  if (city) return city;
  const ab = abbrev.trim();
  if (ab && gmt) return `${ab} (${gmt})`;
  if (gmt) return gmt;
  if (ab) return ab;
  return 'Местное время не указано';
}
