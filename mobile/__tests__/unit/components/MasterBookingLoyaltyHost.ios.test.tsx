import { readFileSync } from 'node:fs';
import path from 'node:path';
import Host from '@src/components/loyalty/MasterBookingLoyaltyHost.ios';

describe('master iOS loyalty isolation', () => {
  const root = path.resolve(__dirname, '../../..');
  const source = (file: string) => readFileSync(path.join(root, file), 'utf8');
  it.each(['Free', 'Paid', 'AlwaysFree'])('mounts no loyalty surface for %s', () => {
    expect(Host({ masterId: 1 })).toBeNull();
  });
  it('resolves master booking details through the iOS no-op without loyalty API imports', () => {
    expect(source('app/(master)/bookings/[id].tsx')).toContain("from '@src/components/loyalty/MasterBookingLoyaltyHost'");
    expect(source('app/(master)/bookings/[id].tsx')).not.toContain('<MasterLoyaltyInfo');
    expect(source('src/components/loyalty/MasterBookingLoyaltyHost.ios.tsx')).not.toMatch(/^import |require\(/m);
    expect(source('src/components/loyalty/MasterBookingLoyaltyHost.tsx')).toContain('<MasterLoyaltyInfo');
    expect(source('src/components/loyalty/MasterLoyaltyInfo.tsx')).toContain('getMasterLoyaltySettingsPublic');
  });
});
