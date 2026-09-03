import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WelcomeTopNav } from '@src/components/welcome/WelcomeTopNav';
import { WelcomeRoleSelector } from '@src/components/welcome/WelcomeRoleSelector.ios';
import { WelcomeCardCarousel } from '@src/components/welcome/WelcomeCardCarousel.ios';
import { WelcomeAuthSheet } from '@src/components/welcome/WelcomeAuthSheet';
import { getWelcomeSlidesForRole, type WelcomeRole } from '@src/data/welcomeSlidesData.ios';
import { analytics, AnalyticsEvent } from '@src/services/analytics';

export default function IosWelcomeScreen() {
  const [role, setRole] = useState<WelcomeRole>('master');
  const [authVisible, setAuthVisible] = useState(false);

  const handleRoleChange = useCallback((nextRole: WelcomeRole) => {
    setRole(nextRole);
    analytics.track(AnalyticsEvent.RoleSelected, { role: nextRole, screen: 'welcome' });
  }, []);

  useEffect(() => {
    analytics.track(AnalyticsEvent.OnboardingCompleted, { screen: 'welcome' });
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <WelcomeTopNav
          onHomePress={() => {}}
          onPricingPress={() => {}}
          onAuthPress={() => setAuthVisible(true)}
          showPricing={false}
        />
        <WelcomeRoleSelector role={role} onRoleChange={handleRoleChange} />
      </View>
      <WelcomeCardCarousel slides={getWelcomeSlidesForRole(role)} resetKey={role} />
      <WelcomeAuthSheet visible={authVisible} onClose={() => setAuthVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { paddingHorizontal: 16, paddingTop: 8 },
});
