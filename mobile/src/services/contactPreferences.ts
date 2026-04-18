import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_CONTACT_PREFERENCES,
  DEFAULT_CONTACT_PRICES,
  CONTACT_CHANNEL_PRIORITY,
  normalizeContactPreferences,
  canEnableChannelOnPlatform,
  buildMockClientPreferences,
  aggregateChannelSummary,
} from 'shared/contactChannels';
import { getMasterClients, MasterClientListItem } from '@src/services/api/master';

const PREFS_STORAGE_KEY = 'dedato_contact_preferences_v1';
const PRICES_STORAGE_KEY = 'dedato_contact_channel_prices_v1';

export type ContactChannel = 'push' | 'email' | 'sms';

export interface ContactPreferences {
  push: boolean;
  email: boolean;
  sms: boolean;
}

export interface ContactChannelPrices {
  push_contact_price: number;
  email_contact_price: number;
  sms_contact_price: number;
}

export interface CampaignChannelRow {
  channel: ContactChannel;
  count: number;
  contact_price: number;
  total_price: number;
}

export interface MasterCampaignChannelSummary {
  channels: CampaignChannelRow[];
  total_clients: number;
  priority: ContactChannel[];
}

export async function getContactPreferences(): Promise<ContactPreferences> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONTACT_PREFERENCES };
    return normalizeContactPreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONTACT_PREFERENCES };
  }
}

export async function saveContactPreferences(next: ContactPreferences): Promise<ContactPreferences> {
  const normalized = normalizeContactPreferences(next);
  await AsyncStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function updateContactPreference(
  channel: ContactChannel,
  enabled: boolean,
  platform: 'mobile' | 'web' = 'mobile'
): Promise<ContactPreferences> {
  if (!canEnableChannelOnPlatform(channel, platform) && enabled) {
    return getContactPreferences();
  }
  const current = await getContactPreferences();
  const next = { ...current, [channel]: Boolean(enabled) };
  return saveContactPreferences(next);
}

export async function getContactChannelPrices(): Promise<ContactChannelPrices> {
  try {
    const raw = await AsyncStorage.getItem(PRICES_STORAGE_KEY);
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

export async function getMasterCampaignChannelSummary(): Promise<MasterCampaignChannelSummary> {
  const [clients, prices] = await Promise.all([
    getMasterClients({ sort_by: 'last_visit_at', sort_dir: 'desc' }),
    getContactChannelPrices(),
  ]);

  const summaryMap = aggregateChannelSummary(
    clients as MasterClientListItem[],
    prices,
    (client) => buildMockClientPreferences(client.client_key)
  );

  const channels: CampaignChannelRow[] = [
    summaryMap.push,
    summaryMap.email,
    summaryMap.sms,
  ];

  return {
    channels,
    total_clients: channels.reduce((acc, c) => acc + c.count, 0),
    priority: [...CONTACT_CHANNEL_PRIORITY],
  };
}

