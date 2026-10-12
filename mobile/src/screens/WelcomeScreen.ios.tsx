import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { WelcomeIosTopBar } from '@src/components/welcome/WelcomeIosTopBar';
import { WelcomeRegistrationRoleModal } from '@src/components/welcome/WelcomeRegistrationRoleModal';
import { WelcomeRoleSelector } from '@src/components/welcome/WelcomeRoleSelector.ios';
import { WelcomeCardCarousel } from '@src/components/welcome/WelcomeCardCarousel.ios';
import { getWelcomeSlidesForRole, type WelcomeRole } from '@src/data/welcomeSlidesData.ios';
import { analytics, AnalyticsEvent } from '@src/services/analytics';

export default function IosWelcomeScreen() {
  const [role, setRole] = useState<WelcomeRole>('master');
  const [registerVisible, setRegisterVisible] = useState(false);

  const handleRoleChange = useCallback((nextRole: WelcomeRole) => {
    setRole(nextRole);
    analytics.track(AnalyticsEvent.RoleSelected, { role: nextRole, screen: 'welcome' });
  }, []);

  const openLogin = useCallback(() => {
    router.push('/login?tab=login');
  }, []);

  const openRegistration = useCallback((nextRole: WelcomeRole) => {
    setRegisterVisible(false);
    router.push(`/login?tab=register&role=${nextRole}`);
  }, []);

  useEffect(() => {
    analytics.track(AnalyticsEvent.OnboardingCompleted, { screen: 'welcome' });
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <WelcomeIosTopBar
          onRegisterPress={() => setRegisterVisible(true)}
          onLoginPress={openLogin}
        />
        <WelcomeRoleSelector role={role} onRoleChange={handleRoleChange} />
      </View>
      <WelcomeCardCarousel slides={getWelcomeSlidesForRole(role)} resetKey={role} />
      <WelcomeRegistrationRoleModal
        visible={registerVisible}
        onClose={() => setRegisterVisible(false)}
        onSelectRole={openRegistration}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { paddingHorizontal: 16, paddingTop: 8 },
});
