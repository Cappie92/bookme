import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AcquisitionChannel,
  AcquisitionTracker,
  defaultTrackerForChannel,
} from './channels';

const STORAGE_KEY = '@dedato/acquisition_v1';
/** Last-touch attribution window (30 days). */
export const LAST_TOUCH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Локальное хранилище first/last touch attribution.
 * Backend sync — отдельный трек (пока НЕ отправляем на API).
 *
 * Фактические источники сейчас:
 * - URL/deeplink с utm_* / campaign / partner query (cold + warm)
 * - Не заполняем install referrer / deferred deep link / AppMetrica tracker params
 *   (SDK умеет requestDeferredDeeplink, но wiring не включён — поля unavailable).
 */
export type AcquisitionTouch = {
  source?: string | null;
  campaign?: string | null;
  medium?: string | null;
  creative?: string | null;
  partner?: string | null;
  tracker?: AcquisitionTracker | string | null;
  channel?: AcquisitionChannel | string | null;
  clickTime?: string | null;
  installTime?: string | null;
  deeplink?: string | null;
};

export type AcquisitionState = {
  first_touch: AcquisitionTouch | null;
  last_touch: AcquisitionTouch | null;
  updatedAt: string | null;
};

async function readState(): Promise<AcquisitionState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { first_touch: null, last_touch: null, updatedAt: null };
    }
    const parsed = JSON.parse(raw) as AcquisitionState;
    return {
      first_touch: parsed.first_touch ?? null,
      last_touch: parsed.last_touch ?? null,
      updatedAt: parsed.updatedAt ?? null,
    };
  } catch {
    return { first_touch: null, last_touch: null, updatedAt: null };
  }
}

async function writeState(state: AcquisitionState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* never break app */
  }
}

function isWithinLastTouchWindow(clickTime: string | null | undefined, nowMs: number): boolean {
  if (!clickTime) return false;
  const t = Date.parse(clickTime);
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= LAST_TOUCH_WINDOW_MS;
}

/**
 * Безопасный разбор marketing params из URL.
 * Без PII: не сохраняем полный URL с токенами/телефонами — только path kind + utm.
 */
export function parseMarketingTouchFromUrl(url: string | null | undefined): AcquisitionTouch | null {
  if (!url || typeof url !== 'string') return null;
  try {
    const normalized = url.trim();
    if (!normalized) return null;
    // Support custom schemes: dedato://host/path?utm=...
    const asHttp = normalized.replace(/^dedato:/i, 'https:');
    const u = new URL(asHttp);
    const q = u.searchParams;
    const utmSource = (q.get('utm_source') || q.get('source') || '').trim() || null;
    const utmMedium = (q.get('utm_medium') || q.get('medium') || '').trim() || null;
    const utmCampaign = (q.get('utm_campaign') || q.get('campaign') || '').trim() || null;
    const utmContent = (q.get('utm_content') || q.get('creative') || '').trim() || null;
    const partner = (q.get('partner') || q.get('utm_partner') || '').trim() || null;
    const trackerRaw = (q.get('tracker') || q.get('appmetrica_tracker') || '').trim() || null;

    const hasMarketing = Boolean(
      utmSource || utmMedium || utmCampaign || utmContent || partner || trackerRaw
    );
    if (!hasMarketing) {
      return null;
    }

    let channel: AcquisitionChannel = AcquisitionChannel.Unknown;
    const src = (utmSource || '').toLowerCase();
    if (src.includes('yandex') || src.includes('direct')) channel = AcquisitionChannel.YandexDirect;
    else if (src.includes('google') && (utmMedium || '').includes('organic')) channel = AcquisitionChannel.Seo;
    else if (src.includes('dedato')) channel = AcquisitionChannel.DedatoRu;
    else if (src.includes('googleplay') || src === 'google_play') channel = AcquisitionChannel.GooglePlay;
    else if (src.includes('rustore')) channel = AcquisitionChannel.RuStore;
    else if (src.includes('appstore') || src === 'app_store') channel = AcquisitionChannel.AppStore;
    else if (partner) channel = AcquisitionChannel.Partner;

    let tracker: AcquisitionTracker = defaultTrackerForChannel(channel);
    if (trackerRaw === 'google_play') tracker = AcquisitionTracker.GooglePlay;
    if (trackerRaw === 'rustore') tracker = AcquisitionTracker.RuStore;
    if (trackerRaw === 'app_store') tracker = AcquisitionTracker.AppStore;

    // Не храним полный URL (может содержать PII в query) — только безопасный path tag.
    let deeplinkTag: string | null = null;
    if (/\/m\//i.test(u.pathname) || u.hostname === 'm') deeplinkTag = '/m/*';
    else if (/subscription/i.test(u.pathname) || u.hostname === 'subscriptions') {
      deeplinkTag = 'dedato://subscriptions';
    }

    return {
      source: utmSource,
      medium: utmMedium,
      campaign: utmCampaign,
      creative: utmContent,
      partner,
      channel,
      tracker,
      deeplink: deeplinkTag,
      clickTime: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export const AcquisitionService = {
  async getState(): Promise<AcquisitionState> {
    return readState();
  },

  /**
   * Эффективный last_touch с учётом 30-дневного окна.
   * Если старше окна — null (first_touch не трогаем).
   */
  async getEffectiveLastTouch(nowMs: number = Date.now()): Promise<AcquisitionTouch | null> {
    const state = await readState();
    if (!state.last_touch) return null;
    if (!isWithinLastTouchWindow(state.last_touch.clickTime, nowMs)) return null;
    return state.last_touch;
  },

  /**
   * Записать marketing touch.
   * first_touch — один раз, не перезаписывается.
   * last_touch — обновляется при каждом валидном marketing touch + timestamp.
   */
  async recordTouch(touch: AcquisitionTouch): Promise<AcquisitionState> {
    const now = new Date().toISOString();
    const normalized: AcquisitionTouch = {
      ...touch,
      tracker:
        touch.tracker ||
        (touch.channel
          ? defaultTrackerForChannel(touch.channel as AcquisitionChannel)
          : AcquisitionTracker.Unknown),
      clickTime: touch.clickTime || now,
    };

    const current = await readState();
    const next: AcquisitionState = {
      first_touch: current.first_touch ?? {
        ...normalized,
        installTime: normalized.installTime || now,
      },
      last_touch: normalized,
      updatedAt: now,
    };
    await writeState(next);
    return next;
  },

  /** Разобрать URL и записать touch только если есть marketing params. */
  async recordTouchFromUrl(url: string | null | undefined): Promise<AcquisitionState | null> {
    const touch = parseMarketingTouchFromUrl(url);
    if (!touch) return null;
    return this.recordTouch(touch);
  },

  async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  },
};
