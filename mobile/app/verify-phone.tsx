import { useEffect, useRef, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { isAxiosError } from 'axios';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@src/auth/AuthContext';
import { isPendingPhoneVerificationExpired } from '@src/auth/pendingPhoneVerificationStorage';
import {
  confirmSignupPhoneVerification,
  requestSignupPhoneVerification,
} from '@src/services/api/auth';
import {
  getPublicBookingDraft,
  isDraftValidForPostLoginRedirect,
} from '@src/stores/publicBookingDraftStore';

function apiErrorMessage(error: unknown, fallback: string): string {
  if (!isAxiosError(error)) {
    return error instanceof Error && error.message ? error.message : fallback;
  }
  const data = error.response?.data as { detail?: unknown; message?: unknown } | undefined;
  const detail = data?.detail ?? data?.message;
  return typeof detail === 'string' && detail ? detail : fallback;
}

function isRestrictedTokenRejected(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 401;
}

export default function VerifyPhoneScreen() {
  const {
    pendingPhoneVerification,
    completePhoneVerification,
    cancelPendingPhoneVerification,
    expirePendingPhoneVerification,
  } = useAuth();
  const insets = useSafeAreaInsets();
  const [callId, setCallId] = useState('');
  const [digits, setDigits] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const navigatingAwayRef = useRef(false);

  const goToLogin = async (expired: boolean, explanation?: string) => {
    if (navigatingAwayRef.current) return;
    navigatingAwayRef.current = true;
    if (expired) await expirePendingPhoneVerification();
    else await cancelPendingPhoneVerification();
    if (explanation) Alert.alert('Подтверждение телефона', explanation);
    router.replace('/login');
  };

  useEffect(() => {
    if (!pendingPhoneVerification) {
      router.replace('/login');
      return;
    }
    if (isPendingPhoneVerificationExpired(pendingPhoneVerification)) {
      void goToLogin(true, 'Сессия подтверждения истекла. Войдите снова.');
    }
  }, [pendingPhoneVerification]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      void goToLogin(false);
      return true;
    });
    return () => subscription.remove();
  }, []);

  const handleRequestCall = async () => {
    if (!pendingPhoneVerification || requestLoading) return;
    if (isPendingPhoneVerificationExpired(pendingPhoneVerification)) {
      await goToLogin(true, 'Сессия подтверждения истекла. Войдите снова.');
      return;
    }
    setRequestLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await requestSignupPhoneVerification(
        pendingPhoneVerification.verification_token
      );
      if (!response.success || !response.call_id) {
        setError(response.message || 'Не удалось инициировать звонок');
        return;
      }
      setCallId(response.call_id);
      setDigits('');
      setMessage(
        response.message ||
          'Звонок отправлен. Введите последние 4 цифры номера, с которого вам звонят.'
      );
    } catch (requestError) {
      if (isRestrictedTokenRejected(requestError)) {
        await goToLogin(true, 'Сессия подтверждения истекла. Войдите снова.');
        return;
      }
      setError(apiErrorMessage(requestError, 'Ошибка сети при запросе звонка'));
    } finally {
      setRequestLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!pendingPhoneVerification || !callId || digits.length !== 4 || confirmLoading) return;
    setConfirmLoading(true);
    setError('');
    let fullSessionReceived = false;
    try {
      const tokens = await confirmSignupPhoneVerification(
        pendingPhoneVerification.verification_token,
        { call_id: callId, phone_digits: digits }
      );
      fullSessionReceived = true;
      const user = await completePhoneVerification(tokens);
      navigatingAwayRef.current = true;
      const draft = await getPublicBookingDraft().catch(() => null);
      if (isDraftValidForPostLoginRedirect(draft)) {
        router.replace(`/m/${draft.slug}` as any);
        return;
      }
      router.replace(user.role.toLowerCase() === 'client' ? '/client/dashboard' : '/');
    } catch (confirmError) {
      if (isRestrictedTokenRejected(confirmError)) {
        await goToLogin(true, 'Сессия подтверждения истекла. Войдите снова.');
        return;
      }
      if (fullSessionReceived) {
        navigatingAwayRef.current = true;
        Alert.alert(
          'Не удалось загрузить профиль',
          'Телефон подтверждён. Войдите снова, чтобы продолжить.'
        );
        router.replace('/login');
        return;
      }
      setError(apiErrorMessage(confirmError, 'Не удалось подтвердить телефон'));
    } finally {
      setConfirmLoading(false);
    }
  };

  if (!pendingPhoneVerification) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#4CAF50" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: Math.max(insets.top, 16) }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableOpacity
        testID="verify-phone-close"
        accessibilityRole="button"
        accessibilityLabel="Отменить подтверждение"
        style={styles.closeButton}
        onPress={() => void goToLogin(false)}
      >
        <Ionicons name="close" size={26} color="#4B5563" />
      </TouchableOpacity>

      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Ionicons name="call-outline" size={34} color="#4CAF50" />
        </View>
        <Text style={styles.title}>Подтвердите телефон</Text>
        <Text style={styles.description}>
          Мы позвоним на номер
        </Text>
        <Text testID="verify-phone-readonly" style={styles.phone}>
          {pendingPhoneVerification.phone}
        </Text>
        <Text style={styles.description}>
          Номер изменить на этом шаге нельзя. После звонка введите последние 4 цифры номера звонящего.
        </Text>

        <TouchableOpacity
          testID="verify-phone-request-call"
          style={[styles.primaryButton, requestLoading && styles.disabledButton]}
          disabled={requestLoading || confirmLoading}
          onPress={handleRequestCall}
        >
          {requestLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>{callId ? 'Позвонить ещё раз' : 'Получить звонок'}</Text>
          )}
        </TouchableOpacity>

        {message ? <Text style={styles.message}>{message}</Text> : null}
        {error ? <Text testID="verify-phone-error" style={styles.error}>{error}</Text> : null}

        {callId ? (
          <View style={styles.codeSection}>
            <Text style={styles.codeLabel}>Последние 4 цифры</Text>
            <TextInput
              testID="verify-phone-digits"
              accessibilityLabel="Последние 4 цифры номера звонящего"
              value={digits}
              onChangeText={(value) => {
                setDigits(value.replace(/\D/g, '').slice(0, 4));
                setError('');
              }}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={4}
              placeholder="1234"
              style={styles.codeInput}
              textAlign="center"
            />
            <TouchableOpacity
              testID="verify-phone-confirm"
              style={[
                styles.primaryButton,
                (digits.length !== 4 || confirmLoading) && styles.disabledButton,
              ]}
              disabled={digits.length !== 4 || confirmLoading || requestLoading}
              onPress={handleConfirm}
            >
              {confirmLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Подтвердить</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        <TouchableOpacity
          testID="verify-phone-cancel"
          accessibilityRole="button"
          style={styles.cancelButton}
          onPress={() => void goToLogin(false)}
        >
          <Text style={styles.cancelButtonText}>Отмена</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F8F7',
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F8F7',
  },
  closeButton: {
    position: 'absolute',
    right: 18,
    top: 18,
    zIndex: 2,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#EAF7EA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#6B7280',
    textAlign: 'center',
  },
  phone: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginVertical: 8,
  },
  primaryButton: {
    minHeight: 48,
    width: '100%',
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.5,
  },
  message: {
    color: '#397A3C',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 14,
    textAlign: 'center',
  },
  error: {
    color: '#C62828',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 14,
    textAlign: 'center',
  },
  codeSection: {
    width: '100%',
    marginTop: 18,
  },
  codeLabel: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  codeInput: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 10,
    color: '#111827',
    backgroundColor: '#fff',
  },
  cancelButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingHorizontal: 20,
  },
  cancelButtonText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '600',
  },
});
