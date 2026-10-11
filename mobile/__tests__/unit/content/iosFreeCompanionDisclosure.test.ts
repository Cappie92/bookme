import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getWelcomeSlidesForRole } from '@src/data/welcomeSlidesData.ios';
import {
  IOS_CLIENT_FREE_FEATURES,
  IOS_FREE_COMPANION_BODY,
  IOS_FREE_COMPANION_PRICES,
  IOS_FREE_COMPANION_TITLE,
  IOS_FREE_COMPANION_WELCOME,
  IOS_MASTER_FREE_FEATURES,
} from '@src/content/iosFreeCompanion';

const mobileRoot = path.resolve(__dirname, '../../..');

function source(relativePath: string): string {
  return readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

describe('iOS free companion disclosure', () => {
  it('states the free companion on the iOS welcome screen', () => {
    const welcome = source('src/screens/WelcomeScreen.ios.tsx');
    expect(welcome).toContain('IosFreeCompanionNotice');
    expect(welcome).toContain('variant="welcome"');
    expect(IOS_FREE_COMPANION_TITLE).toBe('DeDato для iOS — бесплатный компаньон');
    expect(IOS_FREE_COMPANION_WELCOME).toBe(
      'Базовые функции записи, расписания и услуг доступны бесплатно.'
    );
    expect(IOS_FREE_COMPANION_PRICES).toContain('реальным услугам специалистов');
  });

  it('does not keep the retired loyalty claim in active iOS welcome copy', () => {
    const slides = [
      ...getWelcomeSlidesForRole('master'),
      ...getWelcomeSlidesForRole('client'),
    ];
    const copy = slides.map((slide) => `${slide.title} ${slide.description}`).join('\n');
    expect(copy).not.toContain('Скидки и баллы после регистрации');
    expect(copy).toContain('Записывайтесь и управляйте своими визитами');
    expect(source('src/data/welcomeSlidesData.ts')).toContain('Скидки и баллы после регистрации');
  });

  it('gives the signed-in master a disclosure, agreement and support entry', () => {
    const settings = source('app/(master)/master/settings.tsx');
    expect(settings).toContain('variant="master"');
    expect(settings).toContain("Platform.OS === 'ios'");
    expect(IOS_FREE_COMPANION_BODY).toContain('не становятся доступными при наличии веб-подписки');
    expect(IOS_MASTER_FREE_FEATURES).toEqual(
      expect.arrayContaining(['Управление рабочим расписанием', 'Базовый профиль и публичная страница мастера'])
    );
    expect(source('src/components/ios/IosFreeCompanionNotice.tsx')).toContain("USER_AGREEMENT_PATH");
    expect(source('src/components/ios/IosFreeCompanionNotice.tsx')).toContain("IOS_FREE_COMPANION_PATH");
    expect(source('src/components/ios/IosFreeCompanionNotice.tsx')).not.toContain('/pricing');
    expect(source('src/components/ios/IosFreeCompanionNotice.tsx')).not.toContain('checkout');
  });

  it('gives the signed-in client the same required entries', () => {
    const settings = source('app/(client)/settings/index.tsx');
    expect(settings).toContain('variant="client"');
    expect(settings).toContain("Platform.OS === 'ios' ? <IosFreeCompanionNotice");
    expect(IOS_CLIENT_FREE_FEATURES).toEqual([
      'Запись на реальные услуги',
      'Просмотр и управление своими записями',
      'Управление аккаунтом',
    ]);
  });

  it('keeps the Android welcome and website label unchanged', () => {
    expect(source('src/screens/WelcomeScreen.android.tsx')).not.toContain('IosFreeCompanionNotice');
    const settings = source('app/(master)/master/settings.tsx');
    expect(settings).toContain("'Публичная страница'");
    expect(settings).toContain("'Управление сайтом'");
  });
});
