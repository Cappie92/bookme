import { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { ScreenContainer } from '@src/components/ScreenContainer';
import { Card } from '@src/components/Card';
import { SettingsBlock } from '@src/components/SettingsBlock';
import { EditProfileModal } from '@src/components/modals/EditProfileModal';
import { EditWorkSettingsModal } from '@src/components/modals/EditWorkSettingsModal';
import { EditWebsiteModal } from '@src/components/modals/EditWebsiteModal';
import { getMasterSettings, MasterSettings } from '@src/services/api/master';
import { useAuth } from '@src/auth/AuthContext';
import { router, usePathname } from 'expo-router';
import { logger } from '@src/utils/logger';
import { env } from '@src/config/env';
import { changePassword } from '@src/services/api/profile';
import { PrimaryButton } from '@src/components/PrimaryButton';
import { SecondaryButton } from '@src/components/SecondaryButton';
import { isSalonFeaturesEnabled as getSalonFeaturesEnabled } from '@src/config/features';

export default function MasterSettingsScreen() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const [settings, setSettings] = useState<MasterSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [salonFeaturesEnabled, setSalonFeaturesEnabled] = useState(false);
  
  // Состояния для модальных окон
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [editWorkVisible, setEditWorkVisible] = useState(false);
  const [editWebsiteVisible, setEditWebsiteVisible] = useState(false);
  
  // Состояния для смены пароля
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [copyToastVisible, setCopyToastVisible] = useState(false);
  const copyToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSettings = async (mode: 'initial' | 'refresh' = 'initial') => {
    try {
      setError(null);
      if (mode === 'initial') setLoading(true);
      const data = await getMasterSettings();
      setSettings(data);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки настроек');
      console.error('Error loading settings:', err);
    } finally {
      if (mode === 'initial') setLoading(false);
    }
  };

  const onRefreshSettings = async () => {
    setRefreshing(true);
    try {
      await loadSettings('refresh');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadSettings('initial');
    getSalonFeaturesEnabled().then(setSalonFeaturesEnabled).catch(() => setSalonFeaturesEnabled(false));
  }, []);

  useEffect(
    () => () => {
      if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
    },
    []
  );

  const normalizeBaseUrl = (base: string | undefined | null): string => {
    const b = String(base || '').trim();
    if (!b) return '';
    return b.endsWith('/') ? b.slice(0, -1) : b;
  };

  const publicBookingUrl = useMemo(() => {
    const webBase = normalizeBaseUrl(env.WEB_URL);
    const slug =
      settings?.master?.domain != null ? String(settings.master.domain).trim() : '';
    return webBase && slug ? `${webBase}/m/${slug}` : null;
  }, [settings?.master?.domain]);

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('ru-RU');
    } catch {
      return '—';
    }
  };

  const handleChangePassword = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPasswordModal(true);
  };

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
            if (__DEV__ && env.DEBUG_AUTH) logger.info('auth', '[LOGOUT] pressed', { path: pathname ?? 'master/settings' });
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

  // Иконка для показа/скрытия пароля
  const EyeIcon = ({ onPress, visible }: { onPress: () => void; visible: boolean }) => (
    <TouchableOpacity onPress={onPress} style={styles.eyeIcon} accessibilityLabel={visible ? 'Скрыть пароль' : 'Показать пароль'}>
      <Ionicons name={visible ? 'eye-outline' : 'eye-off-outline'} size={22} color="#666" />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Загрузка...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!settings) {
    return (
      <ScreenContainer>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Не удалось загрузить настройки</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      scrollable
      scrollViewProps={{
        refreshControl: (
          <RefreshControl refreshing={refreshing} onRefresh={onRefreshSettings} />
        ),
        contentContainerStyle: {
          padding: 0,
          paddingBottom: 90,
          flexGrow: 1,
        },
      }}
    >
      <View style={styles.pageHeader}>
        <Text style={styles.title}>Настройки</Text>
      </View>

      {settings.master.can_work_independently && publicBookingUrl ? (
        <View style={styles.quickLinkSection}>
          <Text style={styles.quickLinkLabel}>Ссылка на запись</Text>
          <View style={styles.quickLinkRow}>
            <Text style={styles.quickLinkText} numberOfLines={1}>
              {publicBookingUrl}
            </Text>
            <TouchableOpacity
              style={styles.quickLinkCopyBtn}
              onPress={async () => {
                try {
                  await Clipboard.setStringAsync(publicBookingUrl);
                  if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
                  setCopyToastVisible(true);
                  copyToastTimerRef.current = setTimeout(() => {
                    setCopyToastVisible(false);
                    copyToastTimerRef.current = null;
                  }, 2000);
                } catch {
                  Alert.alert('Ошибка', 'Не удалось скопировать ссылку');
                }
              }}
              accessibilityLabel="Копировать ссылку на страницу записи"
            >
              <Ionicons name="copy-outline" size={22} color="#4CAF50" />
            </TouchableOpacity>
          </View>
          {copyToastVisible ? (
            <Text style={styles.copyToastText} accessibilityLiveRegion="polite">
              Скопировано
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.body}>
      {error && (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      )}
        {/* Блок 1: Настройка профиля */}
        <SettingsBlock
          title="Настройка профиля"
          onEdit={() => setEditProfileVisible(true)}
        >
          <View style={styles.infoBlock}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>ФИО:</Text>
              <Text style={styles.infoValue}>{settings.user.full_name || '—'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Телефон:</Text>
              <Text style={styles.infoValue}>{settings.user.phone || '—'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email:</Text>
              <Text style={styles.infoValue}>{settings.user.email || '—'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Дата рождения:</Text>
              <Text style={styles.infoValue}>
                {settings.user.birth_date ? formatDate(settings.user.birth_date) : '—'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Город:</Text>
              <Text style={styles.infoValue}>{settings.master.city || '—'}</Text>
            </View>
          </View>
        </SettingsBlock>

        {/* Блок 2: Настройки работы */}
        <SettingsBlock
          title="Настройки работы"
          onEdit={() => setEditWorkVisible(true)}
        >
          <View style={styles.infoBlock}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Самостоятельная работа:</Text>
              <Text style={styles.infoValue}>
                {settings.master.can_work_independently ? 'Да' : 'Нет'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Работа в салоне:</Text>
              <Text style={styles.infoValue}>
                {settings.master.can_work_in_salon ? 'Да' : 'Нет'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Подтверждение записей:</Text>
              <Text style={styles.infoValue}>
                {settings.master.auto_confirm_bookings ? 'Автоматически' : 'Вручную'}
              </Text>
            </View>
            {settings.master.can_work_independently && (
              <>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Адрес:</Text>
                  <Text style={styles.infoValue}>{settings.master.address || 'Не указан'}</Text>
                </View>
              </>
            )}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>О себе:</Text>
              <Text style={styles.infoValue}>{settings.master.bio || 'Не указано'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Опыт работы:</Text>
              <Text style={styles.infoValue}>
                {settings.master.experience_years || 0} лет
              </Text>
            </View>
          </View>
        </SettingsBlock>

        {/* Блок 3: Управление сайтом (только если can_work_independently) */}
        {settings.master.can_work_independently && (
          <SettingsBlock
            title="Управление сайтом"
            onEdit={() => setEditWebsiteVisible(true)}
          >
            <View style={styles.infoBlock}>
              {settings.master.domain && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Адрес сайта:</Text>
                  <Text style={styles.infoValue} numberOfLines={1}>
                    /m/{settings.master.domain}
                  </Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Текстовый блок:</Text>
                <Text style={styles.infoValue}>
                  {settings.master.site_description ? 'Настроен' : 'Не настроен'}
                </Text>
              </View>
            </View>
          </SettingsBlock>
        )}

        {/* Ограничения клиентов вынесены в меню (пункт с тарифным ограничением) */}

        {/* Кнопка изменения пароля */}
        <View style={styles.passwordSection}>
          <TouchableOpacity
            style={styles.passwordButton}
            onPress={handleChangePassword}
            activeOpacity={0.7}
          >
            <Text style={styles.passwordButtonText}>Изменить пароль</Text>
          </TouchableOpacity>
        </View>

        {/* Кнопка выхода */}
        <View style={styles.logoutSection}>
          <TouchableOpacity
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
      </View>

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

      {/* Модальные окна */}
      <EditProfileModal
        visible={editProfileVisible}
        onClose={() => setEditProfileVisible(false)}
        settings={settings}
        onSave={() => loadSettings('refresh')}
      />

      <EditWorkSettingsModal
        visible={editWorkVisible}
        onClose={() => setEditWorkVisible(false)}
        settings={settings}
        onSave={() => loadSettings('refresh')}
        isSalonFeaturesEnabled={salonFeaturesEnabled}
      />

      <EditWebsiteModal
        visible={editWebsiteVisible}
        onClose={() => setEditWebsiteVisible(false)}
        settings={settings}
        onSave={() => loadSettings('refresh')}
        frontendBaseUrl={env.WEB_URL}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  pageHeader: {
    backgroundColor: '#fff',
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  quickLinkSection: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e0e0e0',
  },
  quickLinkLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  quickLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickLinkText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  quickLinkCopyBtn: {
    padding: 8,
  },
  copyToastText: {
    marginTop: 8,
    fontSize: 13,
    color: '#2e7d32',
    fontWeight: '600',
    textAlign: 'center',
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  errorCard: {
    backgroundColor: '#FFEBEE',
    marginBottom: 12,
  },
  errorText: {
    color: '#F44336',
    fontSize: 14,
  },
  infoBlock: {
    paddingVertical: 8,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginRight: 8,
    minWidth: 120,
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  passwordSection: {
    marginTop: 24,
    marginBottom: 16,
  },
  passwordButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  passwordButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  logoutSection: {
    marginBottom: 24,
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
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
  },
});
