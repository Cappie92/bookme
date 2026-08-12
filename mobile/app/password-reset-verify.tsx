import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isAxiosError } from 'axios';
import { usePasswordResetRecovery } from '@src/auth/PasswordResetRecoveryContext';
import { isPendingPasswordResetExpired } from '@src/auth/pendingPasswordResetStorage';
import { confirmPasswordResetPhone, requestPasswordResetPhone } from '@src/services/api/auth';

function errorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as { detail?: unknown } | undefined;
    if (typeof data?.detail === 'string') return data.detail;
  }
  return 'Не удалось подтвердить цифры. Попробуйте ещё раз.';
}

export default function PasswordResetVerifyScreen() {
  const insets = useSafeAreaInsets();
  const {
    pendingPasswordReset,
    beginPhonePasswordReset,
    acceptPasswordResetToken,
    cancelPasswordReset,
    expirePasswordReset,
  } = usePasswordResetRecovery();
  const [digits, setDigits] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const cancel = async () => {
    await cancelPasswordReset();
    router.replace('/login');
  };

  const expire = async () => {
    await expirePasswordReset();
    Alert.alert('Восстановление пароля', 'Сессия восстановления истекла. Начните заново.');
    router.replace('/login');
  };

  useEffect(() => {
    if (!pendingPasswordReset || pendingPasswordReset.stage !== 'verification') {
      router.replace('/login');
      return;
    }
    if (isPendingPasswordResetExpired(pendingPasswordReset)) void expire();
  }, [pendingPasswordReset]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      void cancel();
      return true;
    });
    return () => subscription.remove();
  }, []);

  if (!pendingPasswordReset || pendingPasswordReset.stage !== 'verification') {
    return <View style={styles.centered}><ActivityIndicator color="#4CAF50" /></View>;
  }

  const confirm = async () => {
    if (digits.length !== 4 || loading) return;
    if (isPendingPasswordResetExpired(pendingPasswordReset)) {
      await expire();
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await confirmPasswordResetPhone({
        challenge_token: pendingPasswordReset.challenge_token,
        call_id: pendingPasswordReset.call_id,
        phone_digits: digits,
      });
      await acceptPasswordResetToken(response);
      router.replace('/reset-password');
    } catch (confirmError) {
      setError(errorMessage(confirmError));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const response = await requestPasswordResetPhone(pendingPasswordReset.phone);
      await beginPhonePasswordReset(pendingPasswordReset.phone, response);
      setDigits('');
    } catch {
      setError('Не удалось повторить звонок. Проверьте сеть.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: Math.max(insets.top, 20) }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Подтвердите звонок</Text>
        <Text style={styles.description}>Введите последние 4 цифры номера, с которого звонят на {pendingPasswordReset.phone}.</Text>
        <TextInput
          testID="password-reset-digits"
          value={digits}
          onChangeText={(value) => { setDigits(value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={4}
          textAlign="center"
          placeholder="1234"
          style={styles.codeInput}
        />
        {error ? <Text testID="password-reset-confirm-error" style={styles.error}>{error}</Text> : null}
        <TouchableOpacity
          testID="password-reset-confirm"
          style={[styles.primaryButton, (loading || digits.length !== 4) && styles.disabled]}
          disabled={loading || digits.length !== 4}
          onPress={confirm}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Подтвердить</Text>}
        </TouchableOpacity>
        <TouchableOpacity testID="password-reset-resend" style={styles.secondaryButton} disabled={loading} onPress={resend}>
          <Text style={styles.linkText}>Позвонить повторно</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="password-reset-verify-cancel" style={styles.secondaryButton} onPress={() => void cancel()}>
          <Text style={styles.secondaryText}>Отмена</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, backgroundColor: '#F7F8F7' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8F7' },
  card: { borderRadius: 20, backgroundColor: '#fff', padding: 24 },
  title: { fontSize: 24, fontWeight: '700', color: '#222', marginBottom: 12 },
  description: { fontSize: 15, lineHeight: 21, color: '#667085', marginBottom: 22 },
  codeInput: { minHeight: 56, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 10, fontSize: 24, letterSpacing: 8 },
  error: { color: '#D92D20', fontSize: 13, marginTop: 8 },
  primaryButton: { minHeight: 48, borderRadius: 10, backgroundColor: '#4CAF50', alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  disabled: { opacity: 0.6 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  linkText: { color: '#4CAF50', fontSize: 15, fontWeight: '600' },
  secondaryText: { color: '#667085', fontSize: 15 },
});
