import AsyncStorage from '@react-native-async-storage/async-storage';

// Единый источник feature toggles для mobile (аналогично web: localStorage appointo_feature_settings)
export const FEATURE_SETTINGS_KEY = 'appointo_feature_settings';

export interface FeatureSettings {
  enableSalonFeatures: boolean;
  enableBlog: boolean;
  enableReviews: boolean;
  enableRegistration: boolean;
}

export const defaultFeatureSettings: FeatureSettings = {
  enableSalonFeatures: false, // По умолчанию салонные функции выключены
  enableBlog: true,
  enableReviews: true,
  enableRegistration: true,
};

export async function getFeatureSettings(): Promise<FeatureSettings> {
  try {
    const raw = await AsyncStorage.getItem(FEATURE_SETTINGS_KEY);
    if (!raw) return defaultFeatureSettings;
    const parsed = JSON.parse(raw) as Partial<FeatureSettings>;
    return {
      ...defaultFeatureSettings,
      ...parsed,
    };
  } catch {
    return defaultFeatureSettings;
  }
}

export async function isSalonFeaturesEnabled(): Promise<boolean> {
  const settings = await getFeatureSettings();
  return settings.enableSalonFeatures === true;
}

export async function updateFeatureSettings(updates: Partial<FeatureSettings>): Promise<FeatureSettings> {
  const current = await getFeatureSettings();
  const updated: FeatureSettings = { ...current, ...updates };
  await AsyncStorage.setItem(FEATURE_SETTINGS_KEY, JSON.stringify(updated));
  return updated;
}


