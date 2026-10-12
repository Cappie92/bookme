import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WelcomeRole } from '@src/data/welcomeSlidesData.ios';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelectRole: (role: WelcomeRole) => void;
};

export function WelcomeRegistrationRoleModal({ visible, onClose, onSelectRole }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Закрыть" />
        <View style={styles.dialog} testID="welcome-registration-role-modal">
          <View style={styles.header}>
            <Text style={styles.title}>Создать аккаунт</Text>
            <TouchableOpacity
              onPress={onClose}
              testID="welcome-registration-close"
              accessibilityRole="button"
              accessibilityLabel="Закрыть"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={22} color="#666" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.choice}
            onPress={() => onSelectRole('master')}
            testID="welcome-registration-master"
            accessibilityRole="button"
          >
            <Text style={styles.choiceText}>Я мастер</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.choice}
            onPress={() => onSelectRole('client')}
            testID="welcome-registration-client"
            accessibilityRole="button"
          >
            <Text style={styles.choiceText}>Я клиент</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancel}
            onPress={onClose}
            testID="welcome-registration-cancel"
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>Отмена</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1c1917',
  },
  choice: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    backgroundColor: '#f1f8f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  choiceText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2e7d32',
  },
  cancel: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
});
