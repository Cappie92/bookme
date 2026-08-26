import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { appleIapService } from '@src/services/purchases/AppleIapService';

interface Props {
  visible: boolean;
  onCancel: () => void;
  onContinueDeletion: () => void;
}

export function AppleSubscriptionDeletionWarningModal({
  visible,
  onCancel,
  onContinueDeletion,
}: Props) {
  const [openingManagement, setOpeningManagement] = useState(false);

  const openManageSubscription = async () => {
    setOpeningManagement(true);
    try {
      await appleIapService.showManageSubscriptions();
    } catch {
      Alert.alert('Ошибка', 'Не удалось открыть управление подпиской App Store');
    } finally {
      setOpeningManagement(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.content} accessibilityViewIsModal>
          <Text style={styles.title}>Активная подписка App Store</Text>
          <Text style={styles.warning} testID="apple-subscription-deletion-warning">
            Удаление аккаунта DeDato не отменяет Apple auto-renewal. Управление списаниями
            выполняется отдельно через Apple. Если вы не хотите последующих списаний, отключите
            автопродление через «Manage Subscription».
          </Text>
          <Text style={styles.note}>
            Вы можете вернуться сюда и продолжить немедленное удаление аккаунта. DeDato не может
            самостоятельно отменить подписку Apple.
          </Text>
          <TouchableOpacity
            style={styles.manageButton}
            onPress={openManageSubscription}
            disabled={openingManagement}
            testID="account-deletion-manage-apple-subscription"
          >
            {openingManagement ? (
              <ActivityIndicator color="#2E7D32" />
            ) : (
              <Text style={styles.manageButtonText}>Manage Subscription</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.continueButton}
            onPress={onContinueDeletion}
            testID="account-deletion-continue"
          >
            <Text style={styles.continueButtonText}>Продолжить удаление аккаунта</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel} testID="account-deletion-cancel">
            <Text style={styles.cancelButtonText}>Не удалять аккаунт</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 20,
    backgroundColor: '#fff',
    padding: 20,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#1C1917', marginBottom: 12 },
  warning: { fontSize: 15, lineHeight: 22, color: '#B91C1C', marginBottom: 10 },
  note: { fontSize: 14, lineHeight: 20, color: '#4B5563', marginBottom: 18 },
  manageButton: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  manageButtonText: { color: '#2E7D32', fontWeight: '700' },
  continueButton: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#B91C1C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  continueButtonText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  cancelButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { color: '#4B5563', fontWeight: '600' },
});
