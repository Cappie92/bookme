import { Modal, View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

type WelcomeAuthSheetProps = {
  visible: boolean;
  onClose: () => void;
};

type AuthAction = {
  id: string;
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  testID: string;
  primary?: boolean;
};

const AUTH_ACTIONS: AuthAction[] = [
  {
    id: 'login',
    label: 'Войти',
    subtitle: 'Уже есть аккаунт',
    icon: 'log-in-outline',
    route: '/login?tab=login',
    testID: 'welcome-auth-login',
    primary: true,
  },
  {
    id: 'register-master',
    label: 'Регистрация мастера',
    subtitle: 'Страница записи и расписание',
    icon: 'cut-outline',
    route: '/login?tab=register&role=master',
    testID: 'welcome-auth-register-master',
  },
  {
    id: 'register-client',
    label: 'Регистрация клиента',
    subtitle: 'Запись к мастерам онлайн',
    icon: 'person-outline',
    route: '/login?tab=register&role=client',
    testID: 'welcome-auth-register-client',
  },
];

export function WelcomeAuthSheet({ visible, onClose }: WelcomeAuthSheetProps) {
  const insets = useSafeAreaInsets();

  const handleAction = (route: string) => {
    onClose();
    router.push(route as any);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Закрыть" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 8) + 8 }]}>
          <Text style={styles.title}>Вход и регистрация</Text>
          <Text style={styles.subtitle}>Выберите действие</Text>
          <View style={styles.actions}>
            {AUTH_ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.id}
                style={[styles.action, action.primary && styles.actionPrimary]}
                onPress={() => handleAction(action.route)}
                testID={action.id === 'login' ? 'welcome-login-button' : action.testID}
                accessibilityRole="button"
              >
                <Ionicons
                  name={action.icon}
                  size={22}
                  color={action.primary ? '#fff' : '#4CAF50'}
                  style={styles.actionIcon}
                />
                <View style={styles.actionTextCol}>
                  <Text style={[styles.actionLabel, action.primary && styles.actionLabelPrimary]}>
                    {action.label}
                  </Text>
                  <Text style={[styles.actionSubtitle, action.primary && styles.actionSubtitlePrimary]}>
                    {action.subtitle}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={action.primary ? '#fff' : '#999'}
                />
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.cancel} onPress={onClose} accessibilityRole="button">
            <Text style={styles.cancelText}>Отмена</Text>
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
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  actions: {
    gap: 10,
    marginBottom: 12,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#eee',
  },
  actionPrimary: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  actionIcon: {
    marginRight: 12,
  },
  actionTextCol: {
    flex: 1,
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  actionLabelPrimary: {
    color: '#fff',
  },
  actionSubtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  actionSubtitlePrimary: {
    color: 'rgba(255,255,255,0.85)',
  },
  cancel: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
});
