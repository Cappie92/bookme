import { apiGet } from '../utils/api';
import {
  DEFAULT_CONTACT_PREFERENCES,
  DEFAULT_CONTACT_PRICES,
  CONTACT_CHANNEL_PRIORITY,
  normalizeContactPreferences,
  canEnableChannelOnPlatform,
  buildMockClientPreferences,
  aggregateChannelSummary,
} from 'shared/contactChannels';

const PREFS_STORAGE_KEY = 'dedato_contact_preferences_v1';
const PRICES_STORAGE_KEY = 'dedato_contact_channel_prices_v1';

export async function getContactPreferences() {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONTACT_PREFERENCES };
    return normalizeContactPreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONTACT_PREFERENCES };
  }
}

export async function saveContactPreferences(next) {
  const normalized = normalizeContactPreferences(next);
  localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function updateContactPreference(channel, enabled, platform = 'web') {
  if (!canEnableChannelOnPlatform(channel, platform) && enabled) {
    return getContactPreferences();
  }
  const current = await getContactPreferences();
  const next = { ...current, [channel]: Boolean(enabled) };
  return saveContactPreferences(next);
}

export async function getContactChannelPrices() {
  try {
    const raw = localStorage.getItem(PRICES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONTACT_PRICES };
    const parsed = JSON.parse(raw);
    return {
      push_contact_price: Number(parsed.push_contact_price ?? DEFAULT_CONTACT_PRICES.push_contact_price),
      email_contact_price: Number(parsed.email_contact_price ?? DEFAULT_CONTACT_PRICES.email_contact_price),
      sms_contact_price: Number(parsed.sms_contact_price ?? DEFAULT_CONTACT_PRICES.sms_contact_price),
    };
  } catch {
    return { ...DEFAULT_CONTACT_PRICES };
  }
}

export async function saveContactChannelPrices(prices) {
  const next = {
    push_contact_price: Number(prices.push_contact_price ?? DEFAULT_CONTACT_PRICES.push_contact_price),
    email_contact_price: Number(prices.email_contact_price ?? DEFAULT_CONTACT_PRICES.email_contact_price),
    sms_contact_price: Number(prices.sms_contact_price ?? DEFAULT_CONTACT_PRICES.sms_contact_price),
  };
  localStorage.setItem(PRICES_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function getMasterCampaignChannelSummary() {
  const [clients, prices] = await Promise.all([
    apiGet('/api/master/clients'),
    getContactChannelPrices(),
  ]);

  const summaryMap = aggregateChannelSummary(
    Array.isArray(clients) ? clients : [],
    prices,
    (client) => buildMockClientPreferences(client.client_key)
  );

  const channels = [summaryMap.push, summaryMap.email, summaryMap.sms];
  return {
    channels,
    total_clients: channels.reduce((acc, c) => acc + c.count, 0),
    priority: [...CONTACT_CHANNEL_PRIORITY],
  };
}

