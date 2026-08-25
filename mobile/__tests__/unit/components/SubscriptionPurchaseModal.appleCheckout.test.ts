import { readFileSync } from 'fs';
import { join } from 'path';

describe('SubscriptionPurchaseModal Apple checkout contract', () => {
  const source = readFileSync(
    join(__dirname, '../../../src/components/subscriptions/SubscriptionPurchaseModal.tsx'),
    'utf8'
  );
  const appleBranchStart = source.indexOf('if (useAppleCheckout) {');
  const robokassaBranchStart = source.indexOf("<Text style={[styles.tableKey, styles.tableKeyStrong]}>К оплате картой</Text>");
  const appleBranch = source.slice(appleBranchStart, robokassaBranchStart);

  it('returns the Apple presentation before rendering Robokassa semantics', () => {
    expect(appleBranchStart).toBeGreaterThan(-1);
    expect(robokassaBranchStart).toBeGreaterThan(appleBranchStart);
    expect(appleBranch).not.toContain('Доступный баланс');
    expect(appleBranch).not.toContain('Оплата без перехода на карту');
    expect(appleBranch).not.toContain('onToggleAutoRenewal');
  });

  it('shows StoreKit price, auto-renew disclosure and an unavailable-product state', () => {
    expect(appleBranch).toContain('ios-storekit-checkout-price');
    expect(appleBranch).toContain('ios-auto-renew-disclosure');
    expect(appleBranch).toContain('Подписка продлевается автоматически');
    expect(appleBranch).toContain('ios-product-unavailable');
  });

  it('exposes explicit restore, system management and legal actions', () => {
    expect(appleBranch).toContain('ios-checkout-restore-purchases');
    expect(appleBranch).toContain('ios-checkout-manage-subscription');
    expect(appleBranch).toContain('ios-checkout-privacy-link');
    expect(appleBranch).toContain('ios-checkout-terms-link');
  });

  it('opens the dedicated Privacy Policy and keeps Terms on the User Agreement', () => {
    expect(source).toContain('onOpenPrivacy={() => handleOpenLegalDocument(PRIVACY_POLICY_PATH)}');
    expect(source).toContain('onOpenTerms={() => handleOpenLegalDocument(USER_AGREEMENT_PATH)}');
    expect(source).not.toContain(
      'onOpenPrivacy={() => handleOpenLegalDocument(PERSONAL_DATA_CONSENT_PATH)}'
    );
  });

  it('does not use numeric plan IDs for Apple product resolution', () => {
    expect(source).toContain('getAppleProductId(selectedPlan.name, selectedDuration)');
    expect(source).not.toContain('getAppleProductId(selectedPlan.id');
  });
});
