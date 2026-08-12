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
import { normalizeRussianPhoneForApi } from '@src/utils/normalizeRussianPhoneForApi';
import { requestPasswordResetPhone } from '@src/services/api/auth';
import { usePasswordResetRecovery } from '@src/auth/PasswordResetRecoveryContext';

function formatPhone(input: string): string {
  let digits = input.replace(/\D/g, '');
  if ((digits.startsWith('7') || digits.startsWith('8')) && digits.length === 11) {
    digits = digits.slice(1);
  } else if (digits.startsWith('7')) {
    digits = digits.slice(1);
  }
  return `+7${digits.slice(0, 10)}`;
}

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { beginPhonePasswordReset, cancelPasswordReset } = usePasswordResetRecovery();
  const [phone, setPhone] = useState('+7');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const cancel = async () => {
    await cancelPasswordReset();
    router.replace('/login');
  };

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      void cancel();
      return true;
    });
    return () => subscription.remove();
  }, []);

  const submit = async () => {
    const normalized = normalizeRussianPhoneForApi(phone.trim());
    if (!/^\+7\d{10}$/.test(normalized)) {
      setError('Введите номер телефона в формате +7XXXXXXXXXX');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await requestPasswordResetPhone(normalized);
      await beginPhonePasswordReset(normalized, response);
      router.replace('/password-reset-verify');
    } catch {
      setError('Не удалось отправить звонок. Проверьте сеть и попробуйте снова.');
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
        <Text style={styles.title}>Восстановление пароля</Text>
        <Text style={styles.description}>
          Укажите номер телефона. Мы позвоним, а вы введёте последние 4 цифры номера звонящего.
        </Text>
        <Text style={styles.label}>Номер телефона</Text>
        <TextInput
          testID="password-reset-phone"
          value={phone}
          onChangeText={(value) => {
            setPhone(formatPhone(value));
            setError('');
          }}
          keyboardType="phone-pad"
          autoComplete="tel"
          editable={!loading}
          style={styles.input}
        />
        {error ? <Text testID="password-reset-request-error" style={styles.error}>{error}</Text> : null}
        <TouchableOpacity
          testID="password-reset-request"
          style={[styles.primaryButton, loading && styles.disabled]}
          disabled={loading}
          onPress={submit}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Получить звонок</Text>}
        </TouchableOpacity>
        <TouchableOpacity testID="password-reset-cancel" style={styles.secondaryButton} onPress={() => void cancel()}>
          <Text style={styles.secondaryText}>Отмена</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, backgroundColor: '#F7F8F7' },
  card: { borderRadius: 20, backgroundColor: '#fff', padding: 24 },
  title: { fontSize: 24, fontWeight: '700', color: '#222', marginBottom: 12 },
  description: { fontSize: 15, lineHeight: 21, color: '#667085', marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', color: '#344054', marginBottom: 8 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 10, paddingHorizontal: 14, fontSize: 16 },
  error: { color: '#D92D20', fontSize: 13, marginTop: 8 },
  primaryButton: { minHeight: 48, borderRadius: 10, backgroundColor: '#4CAF50', alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  disabled: { opacity: 0.6 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  secondaryText: { color: '#667085', fontSize: 15 },
});
