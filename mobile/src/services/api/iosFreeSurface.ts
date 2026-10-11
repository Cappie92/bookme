import { isIosFreeCompanion } from '@src/config/iosProductModel';

type SurfaceConfig = {
  url?: string;
  params?: Record<string, unknown>;
};

/** Force the native free marker. An existing client_surface value is not a privilege. */
export function applyIosFreeSurface(config: SurfaceConfig, platformOS: string): void {
  if (!isIosFreeCompanion(platformOS)) return;
  config.params = {
    ...(config.params ?? {}),
    client_surface: 'ios_fixed',
  };
  if (config.url && config.url.includes('client_surface=')) {
    config.url = config.url.replace(/([?&])client_surface=[^&]*/g, '$1client_surface=ios_fixed');
  }
}
