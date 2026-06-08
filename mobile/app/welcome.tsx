import { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WelcomeTopNav } from '@src/components/welcome/WelcomeTopNav';
import { WelcomeRoleSelector } from '@src/components/welcome/WelcomeRoleSelector';
import { WelcomeCardCarousel } from '@src/components/welcome/WelcomeCardCarousel';
import { WelcomePricingModal } from '@src/components/welcome/WelcomePricingModal';
import { WelcomeAuthSheet } from '@src/components/welcome/WelcomeAuthSheet';
import { getWelcomeSlidesForRole, type WelcomeRole } from '@src/data/welcomeSlidesData';
import type { WelcomePeriodMonths } from '@src/utils/welcomePricing';

export default function WelcomeScreen() {
  const [role, setRole] = useState<WelcomeRole>('master');
  const [pricingVisible, setPricingVisible] = useState(false);
  const [authVisible, setAuthVisible] = useState(false);
  const [selectedPeriodMonths, setSelectedPeriodMonths] = useState<WelcomePeriodMonths>(1);

  const slides = getWelcomeSlidesForRole(role);

  const handleRoleChange = useCallback((nextRole: WelcomeRole) => {
    setRole(nextRole);
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <WelcomeTopNav
          onHomePress={() => {}}
          onPricingPress={() => setPricingVisible(true)}
          onAuthPress={() => setAuthVisible(true)}
        />
        <WelcomeRoleSelector role={role} onRoleChange={handleRoleChange} />
      </View>
      <WelcomeCardCarousel
        slides={slides}
        resetKey={role}
        selectedPeriodMonths={selectedPeriodMonths}
        onPeriodChange={setSelectedPeriodMonths}
        onPricingPress={() => setPricingVisible(true)}
      />
      <WelcomePricingModal
        visible={pricingVisible}
        onClose={() => setPricingVisible(false)}
        selectedPeriodMonths={selectedPeriodMonths}
        onPeriodChange={setSelectedPeriodMonths}
      />
      <WelcomeAuthSheet visible={authVisible} onClose={() => setAuthVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
});
