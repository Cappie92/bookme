/**
 * Рекламные каналы / трекеры (подготовка к attribution).
 * Google Play и RuStore — разные tracker'ы.
 */
export enum AcquisitionChannel {
  YandexDirect = 'yandex_direct',
  Seo = 'seo',
  DedatoRu = 'dedato_ru',
  GooglePlay = 'google_play',
  RuStore = 'rustore',
  AppStore = 'app_store',
  Partner = 'partner',
  Unknown = 'unknown',
}

export enum AcquisitionTracker {
  GooglePlay = 'google_play',
  RuStore = 'rustore',
  AppStore = 'app_store',
  YandexDirect = 'yandex_direct',
  Partner = 'partner',
  Organic = 'organic',
  Unknown = 'unknown',
}

export function defaultTrackerForChannel(channel: AcquisitionChannel): AcquisitionTracker {
  switch (channel) {
    case AcquisitionChannel.GooglePlay:
      return AcquisitionTracker.GooglePlay;
    case AcquisitionChannel.RuStore:
      return AcquisitionTracker.RuStore;
    case AcquisitionChannel.AppStore:
      return AcquisitionTracker.AppStore;
    case AcquisitionChannel.YandexDirect:
      return AcquisitionTracker.YandexDirect;
    case AcquisitionChannel.Partner:
      return AcquisitionTracker.Partner;
    case AcquisitionChannel.Seo:
    case AcquisitionChannel.DedatoRu:
      return AcquisitionTracker.Organic;
    default:
      return AcquisitionTracker.Unknown;
  }
}
