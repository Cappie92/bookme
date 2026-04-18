export const CONTACT_CHANNELS = ['push', 'email', 'sms'];

export const CONTACT_CHANNEL_LABELS = {
  push: 'Пуш',
  email: 'E-mail',
  sms: 'СМС',
};

// Приоритет каналов для агрегации клиентов: push > email > sms
export const CONTACT_CHANNEL_PRIORITY = ['push', 'email', 'sms'];

export const DEFAULT_CONTACT_PREFERENCES = {
  push: true,
  email: true,
  sms: false,
};

export const DEFAULT_CONTACT_PRICES = {
  push_contact_price: 2,
  email_contact_price: 3,
  sms_contact_price: 6,
};

export function normalizeContactPreferences(input) {
  const src = input || {};
  return {
    push: Boolean(src.push),
    email: Boolean(src.email),
    sms: Boolean(src.sms),
  };
}

export function canEnableChannelOnPlatform(channel, platform) {
  if (channel !== 'push') return true;
  return platform === 'mobile';
}

export function getEffectiveContactChannel(preferences) {
  const prefs = normalizeContactPreferences(preferences);
  for (const channel of CONTACT_CHANNEL_PRIORITY) {
    if (prefs[channel]) return channel;
  }
  return null;
}

// Временный mock-источник preference клиентов (до backend contract).
// Детерминированно строится из clientKey, чтобы данные были стабильны между рендерами.
// Только 3 варианта: у каждого есть хотя бы один включённый канал по приоритету push > email > sms
// (нет «все выключены» — такого состояния в продукте для рассылок не моделируем).
export function buildMockClientPreferences(clientKey) {
  const key = String(clientKey || '');
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  const v = Math.abs(hash) % 3;
  switch (v) {
    case 0:
      return { push: true, email: true, sms: true };
    case 1:
      return { push: false, email: true, sms: true };
    default:
      return { push: false, email: false, sms: true };
  }
}

export function aggregateChannelSummary(clients, prices, getPreferencesForClient) {
  const p = { ...DEFAULT_CONTACT_PRICES, ...(prices || {}) };
  const summary = {
    push: { channel: 'push', count: 0, contact_price: Number(p.push_contact_price || 0), total_price: 0 },
    email: { channel: 'email', count: 0, contact_price: Number(p.email_contact_price || 0), total_price: 0 },
    sms: { channel: 'sms', count: 0, contact_price: Number(p.sms_contact_price || 0), total_price: 0 },
  };

  (clients || []).forEach((client) => {
    if (!client || Number(client.completed_count || 0) <= 0) return;
    const prefs = getPreferencesForClient(client);
    const effective = getEffectiveContactChannel(prefs);
    if (!effective) return;
    summary[effective].count += 1;
  });

  CONTACT_CHANNELS.forEach((channel) => {
    summary[channel].total_price = summary[channel].count * summary[channel].contact_price;
  });

  return summary;
}

/** Длина одного SMS-сегмента для тарификации рассылок (символы с пробелами). */
export const SMS_SEGMENT_CHAR_LIMIT = 70;

/**
 * Число SMS-сегментов по длине текста (без учёта пустого сообщения).
 * @param {string} message
 * @returns {number} 0 если текст пустой, иначе ceil(len / 70), минимум 1
 */
export function countSmsSegments(message) {
  const len = String(message ?? '').length;
  if (len === 0) return 0;
  return Math.ceil(len / SMS_SEGMENT_CHAR_LIMIT);
}

/**
 * Итоговая стоимость рассылки для выбранного канала.
 * SMS: count * price * segments(message); Push/E-mail: count * price.
 */
export function computeCampaignChannelTotal(channel, clientCount, contactPrice, message) {
  const c = Number(clientCount || 0);
  const p = Number(contactPrice || 0);
  if (c <= 0 || p <= 0) return 0;
  if (channel === 'sms') {
    const seg = countSmsSegments(message);
    if (seg === 0) return 0;
    return c * p * seg;
  }
  return c * p;
}

/**
 * Публичная страница записи: {origin}/domain/{slug} (как в настройках мастера).
 * @param {string} origin — без завершающего слэша (например https://dedato.ru)
 * @param {string|null|undefined} domain — masters.domain
 */
export function buildMasterPublicBookingUrl(origin, domain) {
  const d = String(domain ?? '').trim();
  if (!d) return '';
  const base = String(origin ?? '').replace(/\/$/, '');
  if (!base) return '';
  return `${base}/domain/${d}`;
}

/**
 * Добавляет URL в конец текста с пробелом при необходимости; не дублирует, если URL уже есть.
 * @returns {{ text: string, inserted: boolean }}
 */
export function appendPublicLinkToMessage(currentText, publicUrl) {
  const url = String(publicUrl ?? '').trim();
  if (!url) return { text: String(currentText ?? ''), inserted: false };
  const t = String(currentText ?? '');
  if (t.includes(url)) return { text: t, inserted: false };
  const sep = t.length === 0 ? '' : /\s$/.test(t) ? '' : ' ';
  return { text: t + sep + url, inserted: true };
}

