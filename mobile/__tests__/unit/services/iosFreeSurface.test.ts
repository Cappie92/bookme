import fs from 'fs';
import path from 'path';

import { applyIosFreeSurface } from '../../../src/services/api/iosFreeSurface';

const root = path.join(__dirname, '../../..');

function source(relative: string): string {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

describe('iOS free surface propagation', () => {
  it('adds ios_fixed only from the iOS API client', () => {
    const client = source('src/services/api/client.ts');
    expect(client).toContain('applyIosFreeSurface(config, Platform.OS)');
  });

  it('forces ios_fixed and ignores a supplied client_surface', () => {
    const config = {
      url: '/api/master/bookings?client_surface=android',
      params: { client_surface: 'web', period: 'week' },
    };
    applyIosFreeSurface(config, 'ios');
    expect(config.params).toEqual({ client_surface: 'ios_fixed', period: 'week' });
    expect(config.url).toContain('client_surface=ios_fixed');
    expect(config.url).not.toContain('client_surface=android');
  });

  it('leaves Android requests unchanged', () => {
    const config = { url: '/api/master/bookings', params: { period: 'week' } };
    applyIosFreeSurface(config, 'android');
    expect(config.params).toEqual({ period: 'week' });
    expect(config.url).toBe('/api/master/bookings');
  });

  it('does not mount paid CRM notes or loyalty spend on the iOS path', () => {
    expect(source('src/components/bookings/BookingCardCompact.tsx')).toContain(
      '!iosFree && booking.has_client_note'
    );
    expect(source('app/(master)/index.tsx')).toContain('!isIosFreeCompanion(Platform.OS)');
    expect(source('app/(public)/m/[slug].tsx')).toContain('if (isIosFreeCompanion(Platform.OS)) return null');
    expect(source('app/(client)/client/dashboard.tsx')).toContain('!isIosFreeCompanion(Platform.OS)');
    expect(source('app/(client)/bookings/[id].tsx')).toContain('!isIosFreeCompanion(Platform.OS)');
  });
});
