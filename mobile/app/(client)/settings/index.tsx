import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TouchableOpacity, Modal, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useAuth } from '@src/auth/AuthContext';
import { router, usePathname } from 'expo-router';
import { logger } from '@src/utils/logger';
import { ScreenContainer } from '@src/components/ScreenContainer';
import { Card } from '@src/components/Card';
import SettingsSection from '@src/components/SettingsSection';
import SettingsRow from '@src/components/SettingsRow';
import { PrimaryButton } from '@src/components/PrimaryButton';
import { SecondaryButton } from '@src/components/SecondaryButton';
import { env } from '@src/config/env';
import { updateClientProfile, changePassword, deleteAccount } from '@src/services/api/profile';
import { getContactPreferences, updateContactPreference } from '@src/services/contactPreferences';

export default function SettingsScreen() {
  const pathname = usePathname();
  const { user, logout, isLoading, refreshUser } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  
  // Состояния для редактирования профиля
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  
  // Состояния для смены пароля
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  
  // Состояния для удаления аккаунта
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState({
    push: true,
    sms: false,
    email: true,
  });

  const didRedirectRef = useRef(false);

  // Редирект в effect, а не в render: вызов router.replace во время render
  // вызывает "Cannot update NavigationContainer while rendering another component"
  useEffect(() => {
    if (isLoading) return;
    if (user) return;
    if (didRedirectRef.current) return;
    didRedirectRef.current = true;
    router.replace('/login');
  }, [isLoading, user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const prefs = await getContactPreferences();
      if (!cancelled) setNotificationPrefs(prefs);
    })();
    return () => { cancelled = true; };
  }, []);

  // Render: только JSX, без router.push/replace
  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      </ScreenContainer>
    );
  }
  if (!user) {
    return (
      <ScreenContainer>
        <View style={styles.centerContainer}>
          <Text style={styles.redirectingText}>Перенаправление...</Text>
        </View>
      </ScreenContainer>
    );
  }

  // Получение инициалов для аватара
  const getInitials = (): string => {
    if (user.full_name) {
      const parts = user.full_name.trim().split(' ');
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return parts[0][0].toUpperCase();
    }
    if (user.phone) {
      return user.phone.slice(-1).toUpperCase();
    }
    return 'U';
  };

  // Получение отображаемого имени
  const getDisplayName = (): string => {
    if (user.full_name) {
      return user.full_name;
    }
    if (user.phone) {
      return user.phone;
    }
    return 'Пользователь';
  };

  // Получение человекочитаемой роли
  const getRoleLabel = (): string => {
    switch (user.role) {
      case 'salon':
        return 'Салон';
      case 'master':
      case 'indie':
        return 'Мастер';
      default:
        return 'Пользователь';
    }
  };

  // Получение версии приложения
  const getAppVersion = (): string => {
    const version = Constants.expoConfig?.version || '1.0.0';
    const buildNumber = Constants.expoConfig?.ios?.buildNumber || 
                       Constants.expoConfig?.android?.versionCode || 
                       '';
    return buildNumber ? `${version} (build ${buildNumber})` : version;
  };

  // Получение информации об окружении API
  const getApiEnvironment = (): string => {
    const apiUrl = env.API_URL || '';
    if (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
      return 'Development';
    }
    if (apiUrl.includes('staging') || apiUrl.includes('stage')) {
      return 'Staging';
    }
    if (apiUrl.includes('prod') || apiUrl.includes('production')) {
      return 'Production';
    }
    try {
      const url = new URL(apiUrl);
      return url.hostname;
    } catch {
      return apiUrl.length > 30 ? apiUrl.substring(0, 30) + '...' : apiUrl;
    }
  };

  // Обработка выхода
  const handleLogout = () => {
    Alert.alert(
      'Выход из аккаунта',
      'Вы уверены, что хотите выйти?',
      [
        {
          text: 'Отмена',
          style: 'cancel',
        },
        {
          text: 'Выйти',
          style: 'destructive',
          onPress: async () => {
            if (__DEV__ && env.DEBUG_AUTH) logger.info('auth', '[LOGOUT] pressed', { path: pathname ?? 'client/settings' });
            setLoggingOut(true);
            try {
              await logout();
              router.replace('/login');
            } catch (error) {
              console.error('Ошибка выхода:', error);
              Alert.alert('Ошибка', 'Не удалось выйти из аккаунта');
            } finally {
              setLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  // Открытие модального окна редактирования профиля
  const handleEditProfile = () => {
    setEditEmail(user.email || '');
    setEditPhone(user.phone || '');
    setShowEditProfileModal(true);
  };

  // Сохранение изменений профиля
  const handleSaveProfile = async () => {
    if (!editEmail.trim() && !editPhone.trim()) {
      Alert.alert('Ошибка', 'Заполните хотя бы одно поле');
      return;
    }

    setSavingProfile(true);
    try {
      const updateData: any = {};
      if (editEmail.trim() && editEmail !== user.email) {
        updateData.email = editEmail.trim();
      }
      if (editPhone.trim() && editPhone !== user.phone) {
        updateData.phone = editPhone.trim();
      }

      if (Object.keys(updateData).length === 0) {
        Alert.alert('Информация', 'Нет изменений для сохранения');
        setShowEditProfileModal(false);
        return;
      }

      await updateClientProfile(updateData);
      Alert.alert('Успешно', 'Профиль обновлен');
      setShowEditProfileModal(false);
      await refreshUser(); // Обновляем данные пользователя
    } catch (error: any) {
      console.error('Ошибка обновления профиля:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Не удалось обновить профиль';
      Alert.alert('Ошибка', errorMessage);
    } finally {
      setSavingProfile(false);
    }
  };

  // Открытие модального окна смены пароля
  const handleChangePassword = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPasswordModal(true);
  };

  // Сохранение нового пароля
  const handleSavePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Ошибка', 'Заполните все поля');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Ошибка', 'Новые пароли не совпадают');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Ошибка', 'Новый пароль должен содержать минимум 6 символов');
      return;
    }

    setChangingPassword(true);
    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      Alert.alert('Успешно', 'Пароль изменен');
      setShowPasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Ошибка смены пароля:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Не удалось сменить пароль';
      Alert.alert('Ошибка', errorMessage);
    } finally {
      setChangingPassword(false);
    }
  };

  // Открытие модального окна удаления аккаунта
  const handleDeleteAccount = () => {
    setDeletePassword('');
    setShowDeleteModal(true);
  };

  // Подтверждение удаления аккаунта
  const handleConfirmDelete = async () => {
    if (!deletePassword) {
      Alert.alert('Ошибка', 'Введите пароль для подтверждения');
      return;
    }

    Alert.alert(
      'Удаление аккаунта',
      'Вы уверены, что хотите удалить аккаунт? Это действие нельзя отменить.',
      [
        {
          text: 'Отмена',
          style: 'cancel',
        },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            setDeletingAccount(true);
            try {
              await deleteAccount({ password: deletePassword });
              Alert.alert('Успешно', 'Аккаунт удален');
              await logout();
              router.replace('/login');
            } catch (error: any) {
              console.error('Ошибка удаления аккаунта:', error);
              const errorMessage = error.response?.data?.detail || error.message || 'Не удалось удалить аккаунт. Проверьте пароль.';
              Alert.alert('Ошибка', errorMessage);
            } finally {
              setDeletingAccount(false);
            }
          },
        },
      ]
    );
  };

  const toggleNotificationPref = async (key: 'push' | 'sms' | 'email') => {
    const next = await updateContactPreference(key, !notificationPrefs[key], 'mobile');
    setNotificationPrefs(next);
  };

  // Иконки для показа/скрытия пароля
  const EyeIcon = ({ onPress, visible }: { onPress: () => void; visible: boolean }) => (
    <TouchableOpacity onPress={onPress} style={styles.eyeIcon}>
      <View style={styles.eyeIconInner}>
        {visible ? (
          <View style={styles.eyeOpen} />
        ) : (
          <View style={styles.eyeClosed} />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <ScreenContainer scrollable>
      {/* Блок профиля */}
      <Card style={styles.profileCard}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials()}</Text>
          </View>
        </View>
        <Text style={styles.profileName}>{getDisplayName()}</Text>
        <Text style={styles.profileRole}>{getRoleLabel()}</Text>
        
        <View style={styles.profileDetails}>
          {user.phone && (
            <View style={styles.profileDetailRow}>
              <Ionicons name="call-outline" size={16} color="#666" style={styles.profileDetailIcon} />
              <Text style={styles.profileDetail}>{user.phone}</Text>
            </View>
          )}
          {user.email && (
            <View style={styles.profileDetailRow}>
              <Ionicons name="mail-outline" size={16} color="#666" style={styles.profileDetailIcon} />
              <Text style={styles.profileDetail}>{user.email}</Text>
            </View>
          )}
        </View>
        
        <TouchableOpacity
          style={styles.editProfileButton}
          onPress={handleEditProfile}
        >
          <Text style={styles.editProfileButtonText}>Редактировать профиль</Text>
        </TouchableOpacity>
      </Card>

      {/* Секция "Настройки аккаунта" */}
      <SettingsSection title="Настройки аккаунта">
        <SettingsRow
          label="Изменить пароль"
          description="Обновить пароль для входа"
          onPress={handleChangePassword}
        />
        <SettingsRow
          label="Управление уведомлениями"
          description="Пуш, СМС и E-mail"
          onPress={() => setShowNotificationsModal(true)}
        />
      </SettingsSection>

      {/* Секция "Приложение" */}
      <SettingsSection title="Приложение">
        <SettingsRow
          label="Версия приложения"
          rightElement={<Text style={styles.rightText}>{getAppVersion()}</Text>}
        />
        <SettingsRow
          label="Окружение API"
          rightElement={<Text style={styles.rightText}>{getApiEnvironment()}</Text>}
        />
        <SettingsRow
          label="О приложении"
          description="DeDato Mobile - управление бронированиями и подписками"
          onPress={() => Alert.alert('О приложении', 'DeDato Mobile\nВерсия: ' + getAppVersion())}
        />
      </SettingsSection>

      {/* Секция "Опасная зона" */}
      <SettingsSection title="Опасная зона">
        <SettingsRow
          label="Удалить аккаунт"
          description="Безвозвратное удаление аккаунта и всех данных"
          onPress={handleDeleteAccount}
          danger={true}
        />
      </SettingsSection>

      {/* Секция "Выход" */}
      <View style={styles.logoutSection}>
        <TouchableOpacity
          testID="logout-button"
          style={[styles.logoutButton, loggingOut && styles.logoutButtonDisabled]}
          onPress={handleLogout}
          disabled={loggingOut}
          activeOpacity={0.7}
        >
          {loggingOut ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.logoutButtonText}>Выйти из аккаунта</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Модальное окно редактирования профиля */}
      <Modal
        visible={showEditProfileModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditProfileModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Редактировать профиль</Text>
            
            <ScrollView style={styles.modalScrollView}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={editEmail}
                  onChangeText={setEditEmail}
                  placeholder="email@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!savingProfile}
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Телефон</Text>
                <TextInput
                  style={styles.input}
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="+7XXXXXXXXXX"
                  keyboardType="phone-pad"
                  editable={!savingProfile}
                />
              </View>
            </ScrollView>

            <View style={styles.modalButtons}>
              <SecondaryButton
                title="Отмена"
                onPress={() => setShowEditProfileModal(false)}
                disabled={savingProfile}
                style={styles.modalButton}
              />
              <PrimaryButton
                title={savingProfile ? "Сохранение..." : "Сохранить"}
                onPress={handleSaveProfile}
                disabled={savingProfile}
                loading={savingProfile}
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Модальное окно смены пароля */}
      <Modal
        visible={showPasswordModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Изменить пароль</Text>
            
            <ScrollView style={styles.modalScrollView}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Текущий пароль</Text>
                <View style={styles.passwordInputContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    placeholder="Введите текущий пароль"
                    secureTextEntry={!showCurrentPassword}
                    autoCapitalize="none"
                    editable={!changingPassword}
                  />
                  <EyeIcon
                    onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                    visible={showCurrentPassword}
                  />
                </View>
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Новый пароль</Text>
                <View style={styles.passwordInputContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Минимум 6 символов"
                    secureTextEntry={!showNewPassword}
                    autoCapitalize="none"
                    editable={!changingPassword}
                  />
                  <EyeIcon
                    onPress={() => setShowNewPassword(!showNewPassword)}
                    visible={showNewPassword}
                  />
                </View>
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Подтвердите новый пароль</Text>
                <View style={styles.passwordInputContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Повторите новый пароль"
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    editable={!changingPassword}
                  />
                  <EyeIcon
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    visible={showConfirmPassword}
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalButtons}>
              <SecondaryButton
                title="Отмена"
                onPress={() => setShowPasswordModal(false)}
                disabled={changingPassword}
                style={styles.modalButton}
              />
              <PrimaryButton
                title={changingPassword ? "Сохранение..." : "Сохранить"}
                onPress={handleSavePassword}
                disabled={changingPassword}
                loading={changingPassword}
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Модальное окно удаления аккаунта */}
      <Modal
        visible={showDeleteModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Удалить аккаунт</Text>
            <Text style={styles.modalWarning}>
              Это действие нельзя отменить. Все ваши данные будут безвозвратно удалены.
            </Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Введите пароль для подтверждения</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={deletePassword}
                  onChangeText={setDeletePassword}
                  placeholder="Введите пароль"
                  secureTextEntry={!showDeletePassword}
                  autoCapitalize="none"
                  editable={!deletingAccount}
                />
                <EyeIcon
                  onPress={() => setShowDeletePassword(!showDeletePassword)}
                  visible={showDeletePassword}
                />
              </View>
            </View>

            <View style={styles.modalButtons}>
              <SecondaryButton
                title="Отмена"
                onPress={() => setShowDeleteModal(false)}
                disabled={deletingAccount}
                style={styles.modalButton}
              />
              <TouchableOpacity
                style={[styles.deleteButton, deletingAccount && styles.deleteButtonDisabled]}
                onPress={handleConfirmDelete}
                disabled={deletingAccount}
              >
                {deletingAccount ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.deleteButtonText}>Удалить аккаунт</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Модальное окно управления уведомлениями */}
      <Modal
        visible={showNotificationsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowNotificationsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Управление уведомлениями</Text>
            <Text style={styles.notificationsHint}>Выберете как мастера могут с вами связываться</Text>

            <View style={styles.notificationsList}>
              <TouchableOpacity
                style={styles.notificationOption}
                onPress={() => toggleNotificationPref('push')}
                activeOpacity={0.7}
              >
                <Text style={styles.notificationLabel}>Пуш</Text>
                <View style={styles.notificationCheck}>
                  {notificationPrefs.push ? <Ionicons name="checkmark" size={22} color="#4CAF50" /> : null}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.notificationOption}
                onPress={() => toggleNotificationPref('sms')}
                activeOpacity={0.7}
              >
                <Text style={styles.notificationLabel}>СМС</Text>
                <View style={styles.notificationCheck}>
                  {notificationPrefs.sms ? <Ionicons name="checkmark" size={22} color="#4CAF50" /> : null}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.notificationOption}
                onPress={() => toggleNotificationPref('email')}
                activeOpacity={0.7}
              >
                <Text style={styles.notificationLabel}>E-mail</Text>
                <View style={styles.notificationCheck}>
                  {notificationPrefs.email ? <Ionicons name="checkmark" size={22} color="#4CAF50" /> : null}
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.modalButtons}>
              <SecondaryButton
                title="Закрыть"
                onPress={() => setShowNotificationsModal(false)}
                style={styles.modalButton}
              />
              <PrimaryButton
                title="Готово"
                onPress={() => setShowNotificationsModal(false)}
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  redirectingText: {
    fontSize: 16,
    color: '#666',
  },
  profileCard: {
    alignItems: 'center',
    marginBottom: 16,
    padding: 24,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  profileRole: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  profileDetails: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  profileDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileDetailIcon: {
    marginRight: 6,
  },
  profileDetail: {
    fontSize: 14,
    color: '#666',
  },
  editProfileButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
  },
  editProfileButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  rightText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  logoutSection: {
    marginTop: 24,
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  logoutButton: {
    backgroundColor: '#F44336',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  logoutButtonDisabled: {
    opacity: 0.6,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  modalWarning: {
    fontSize: 14,
    color: '#F44336',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalScrollView: {
    maxHeight: 400,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingRight: 12,
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    fontSize: 14,
  },
  eyeIcon: {
    padding: 8,
  },
  eyeIconInner: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeOpen: {
    width: 20,
    height: 12,
    borderWidth: 2,
    borderColor: '#666',
    borderRadius: 10,
    borderTopWidth: 0,
  },
  eyeClosed: {
    width: 20,
    height: 2,
    backgroundColor: '#666',
    borderRadius: 1,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#F44336',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  notificationsHint: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  notificationsList: {
    gap: 10,
  },
  notificationOption: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  notificationLabel: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  notificationCheck: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
