import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { PrimaryButton } from '@src/components/PrimaryButton';
import { SecondaryButton } from '@src/components/SecondaryButton';

export function WelcomeCtaRow() {
  return (
    <View style={styles.container}>
      <PrimaryButton
        title="Войти"
        testID="welcome-login-button"
        onPress={() => router.push('/login?tab=login' as any)}
        style={styles.button}
      />
      <SecondaryButton
        title="Создать аккаунт"
        testID="welcome-register-button"
        onPress={() => router.push('/login?tab=register' as any)}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    marginBottom: 28,
  },
  button: {
    width: '100%',
  },
});
