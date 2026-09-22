import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getWelcomeSlidesForRole } from '@src/data/welcomeSlidesData.ios';

describe('iOS welcome companion copy', () => {
  const root = path.resolve(__dirname, '../../..');
  const iosWelcome = readFileSync(path.join(root, 'src/data/welcomeSlidesData.ios.ts'), 'utf8');
  const iosWelcomeScreen = readFileSync(path.join(root, 'src/screens/WelcomeScreen.ios.tsx'), 'utf8');

  it('advertises only operational master work, without pricing or revenue KPI', () => {
    const master = getWelcomeSlidesForRole('master');
    expect(master.some((slide) => slide.id === 'master-dashboard')).toBe(true);
    expect(master.find((slide) => slide.id === 'master-dashboard')?.title).toBe('Записи и рабочий день');
    expect(master.every((slide) => slide.illustration !== 'analytics')).toBe(true);
    const blob = master.map((slide) => `${slide.title} ${slide.description} ${slide.badge ?? ''}`).join('\n');
    expect(blob).not.toMatch(/тариф|подписк|премиум|Premium|\bPro\b|купить|выручк|безлимит|CRM|финанс|домен|браузер/i);
    expect(blob).not.toContain('₽');
    expect(blob).not.toContain('показатели');
  });

  it('keeps client visit discounts without subscription/paywall wording', () => {
    const client = getWelcomeSlidesForRole('client');
    const blob = client.map((slide) => `${slide.title} ${slide.description}`).join('\n');
    expect(blob).toMatch(/скидк|балл/i);
    expect(blob).not.toMatch(/тариф|подписк|Premium|купить/i);
  });

  it('does not mount pricing UI on the iOS welcome screen', () => {
    expect(iosWelcomeScreen).toContain('showPricing={false}');
    expect(iosWelcomeScreen).not.toContain('WelcomePricingModal');
    expect(iosWelcome).not.toMatch(/type: 'pricing'/);
  });

  it('hides the revenue KPI from iOS welcome illustrations', () => {
    const featureCard = readFileSync(path.join(root, 'src/components/welcome/WelcomeFeatureCard.ios.tsx'), 'utf8');
    const carousel = readFileSync(path.join(root, 'src/components/welcome/WelcomeCardCarousel.ios.tsx'), 'utf8');
    const illustration = readFileSync(path.join(root, 'src/components/welcome/WelcomeSlideIllustration.tsx'), 'utf8');
    expect(featureCard).toContain('hideRevenueKpi');
    expect(carousel).toContain('hideRevenueKpi');
    expect(illustration).toContain("hideRevenueKpi ? '12 слотов' : '+92 400 ₽'");
    expect(illustration).toContain("hideRevenueKpi ? 'записей' : 'выручка'");
  });
});
