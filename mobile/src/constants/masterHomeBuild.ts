import { env } from '@src/config/env';

/** Идентификатор сборки dashboard — для smoke release APK. */
export const MASTER_HOME_BUILD_ID = 'home-v2-2442ace';

/** Видимый marker в UI: __DEV__, DEBUG_DASHBOARD=1 или EXPO_PUBLIC_SHOW_HOME_BUILD_MARKER=1 в .env при сборке. */
export function shouldShowMasterHomeBuildMarker(): boolean {
  return __DEV__ || env.DEBUG_DASHBOARD || env.SHOW_HOME_BUILD_MARKER;
}
