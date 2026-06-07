import { ScreenContainer } from '@src/components/ScreenContainer';
import { WelcomeHero } from '@src/components/welcome/WelcomeHero';
import { WelcomeCtaRow } from '@src/components/welcome/WelcomeCtaRow';
import { WelcomeBenefits } from '@src/components/welcome/WelcomeBenefits';
import { WelcomePreview } from '@src/components/welcome/WelcomePreview';

export default function WelcomeScreen() {
  return (
    <ScreenContainer
      scrollable
      backgroundColor="#f5f5f5"
      scrollViewProps={{
        contentContainerStyle: { paddingBottom: 32 },
        showsVerticalScrollIndicator: false,
      }}
    >
      <WelcomeHero />
      <WelcomeCtaRow />
      <WelcomeBenefits />
      <WelcomePreview />
    </ScreenContainer>
  );
}
