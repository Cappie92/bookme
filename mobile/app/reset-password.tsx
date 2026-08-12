import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PasswordInput } from '@src/components/ui/PasswordInput';
import { usePasswordResetRecovery } from '@src/auth/PasswordResetRecoveryContext';
import { isPendingPasswordResetExpired } from '@src/auth/pendingPasswordResetStorage';
import { resetPassword } from '@src/services/api/auth';
import { validateNewPassword } from '@src/auth/passwordResetValidation';

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { pendingPasswordReset, cancelPasswordReset, expirePasswordReset, finishPasswordReset } =
    usePasswordResetRecovery();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
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
    if (!pendingPasswordReset || pendingPasswordReset.stage !== 'new_password') {
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

  if (!pendingPasswordReset || pendingPasswordReset.stage !== 'new_password') {
    return <View style={styles.centered}><ActivityIndicator color="#4CAF50" /></View>;
  }

  const submit = async () => {
    const validationError = validateNewPassword(password, confirmation);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (isPendingPasswordResetExpired(pendingPasswordReset)) {
      await expire();
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await resetPassword(pendingPasswordReset.reset_token, password);
      if (!response.success) {
        await expirePasswordReset();
        Alert.alert('Не удалось изменить пароль', response.message || 'Ссылка восстановления недействительна.');
        router.replace('/login');
        return;
      }
      await finishPasswordReset();
      Alert.alert('Пароль изменён', 'Теперь войдите с новым паролем.');
      router.replace('/login');
    } catch {
      setError('Ошибка сети. Попробуйте ещё раз.');
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
        <Text style={styles.title}>Новый пароль</Text>
        <Text style={styles.description}>Придумайте пароль длиной не менее 6 символов.</Text>
        <Text style={styles.label}>Новый пароль</Text>
        <PasswordInput testID="password-reset-new-password" value={password} onChangeText={(value) => { setPassword(value); setError(''); }} editable={!loading} />
        <Text style={[styles.label, styles.secondLabel]}>Повторите пароль</Text>
        <PasswordInput testID="password-reset-confirm-password" value={confirmation} onChangeText={(value) => { setConfirmation(value); setError(''); }} editable={!loading} />
        {error ? <Text testID="password-reset-password-error" style={styles.error}>{error}</Text> : null}
        <TouchableOpacity testID="password-reset-submit" style={[styles.primaryButton, loading && styles.disabled]} disabled={loading} onPress={submit}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Сохранить пароль</Text>}
        </TouchableOpacity>
        <TouchableOpacity testID="password-reset-new-cancel" style={styles.secondaryButton} onPress={() => void cancel()}>
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
  description: { fontSize: 15, color: '#667085', marginBottom: 22 },
  label: { fontSize: 14, fontWeight: '600', color: '#344054', marginBottom: 8 },
  secondLabel: { marginTop: 16 },
  error: { color: '#D92D20', fontSize: 13, marginTop: 8 },
  primaryButton: { minHeight: 48, borderRadius: 10, backgroundColor: '#4CAF50', alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  disabled: { opacity: 0.6 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  secondaryText: { color: '#667085', fontSize: 15 },
});
