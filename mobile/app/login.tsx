import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, Image, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@src/auth/AuthContext';
import { router } from 'expo-router';
import { logger } from '@src/utils/logger';
import { getPublicBookingDraft, isDraftValidForPostLoginRedirect } from '@src/stores/publicBookingDraftStore';
import { ScreenContainer } from '@src/components/ScreenContainer';
import { cities, getTimezoneByCity } from '@src/data/cities';

type TabType = 'login' | 'register';

export default function LoginScreen() {
  const { login, register } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('login');
  
  // Состояние для входа
  const [phone, setPhone] = useState('+7');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginErrors, setLoginErrors] = useState<{ phone?: string; password?: string }>({});

  // Состояние для регистрации
  const [email, setEmail] = useState('');
  const [registerPhone, setRegisterPhone] = useState('+7');
  const [registerPassword, setRegisterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [userRole, setUserRole] = useState<'client' | 'master'>('client');
  const [agree, setAgree] = useState(false);
  const [infoAgree, setInfoAgree] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerErrors, setRegisterErrors] = useState<{
    email?: string;
    phone?: string;
    password?: string;
    confirmPassword?: string;
    fullName?: string;
    role?: string;
    agree?: string;
    city?: string;
  }>({});
  const [city, setCity] = useState('');
  const [timezone, setTimezone] = useState('');
  const [showCityModal, setShowCityModal] = useState(false);

  // Валидация формы входа
  const validateLoginForm = () => {
    const newErrors: { phone?: string; password?: string } = {};
    
    if (!phone || phone.trim() === '' || phone === '+7') {
      newErrors.phone = 'Введите номер телефона';
    } else if (!/^\+7\d{10}$/.test(phone)) {
      newErrors.phone = 'Номер телефона должен быть в формате +7XXXXXXXXXX';
    }
    
    if (!password || password.length < 6) {
      newErrors.password = 'Пароль должен содержать минимум 6 символов';
    }
    
    setLoginErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Валидация email
  const validateEmail = (emailValue: string): string | undefined => {
    if (!emailValue || emailValue.trim() === '') {
      return 'Введите email';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      return 'Введите корректный email (например: example@mail.com)';
    }
    return undefined;
  };

  // Валидация телефона
  const validatePhone = (phoneValue: string): string | undefined => {
    if (!phoneValue || phoneValue.trim() === '' || phoneValue === '+7') {
      return 'Введите номер телефона';
    }
    if (!/^\+7\d{10}$/.test(phoneValue)) {
      return 'Номер телефона должен быть в формате +7XXXXXXXXXX (10 цифр)';
    }
    return undefined;
  };

  // Валидация пароля
  const validatePassword = (passwordValue: string): string | undefined => {
    if (!passwordValue || passwordValue.length < 6) {
      return 'Пароль должен содержать минимум 6 символов';
    }
    if (passwordValue.length > 128) {
      return 'Пароль не должен превышать 128 символов';
    }
    return undefined;
  };

  // Валидация формы регистрации
  const validateRegisterForm = () => {
    const newErrors: {
      email?: string;
      phone?: string;
      password?: string;
      confirmPassword?: string;
      fullName?: string;
      role?: string;
      agree?: string;
      city?: string;
    } = {};
    
    const emailError = validateEmail(email);
    if (emailError) newErrors.email = emailError;
    
    const phoneError = validatePhone(registerPhone);
    if (phoneError) newErrors.phone = phoneError;
    
    const passwordError = validatePassword(registerPassword);
    if (passwordError) newErrors.password = passwordError;
    
    if (!fullName || fullName.trim().length < 2) {
      newErrors.fullName = 'Введите ваше имя (минимум 2 символа)';
    }
    
    if (registerPassword !== confirmPassword) {
      newErrors.confirmPassword = 'Пароли не совпадают';
    }
    
    if (!userRole || (userRole !== 'client' && userRole !== 'master')) {
      newErrors.role = 'Выберите тип аккаунта';
    }
    
    if (userRole === 'master' && !(city || '').trim()) {
      newErrors.city = 'Выберите город';
    }
    
    if (!agree) {
      newErrors.agree = 'Необходимо согласие с условиями пользовательского соглашения';
    }
    
    setRegisterErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Форматирование телефона
  const formatPhone = (input: string) => {
    let digits = input.replace(/\D/g, '');
    if (digits.startsWith('7')) digits = digits.slice(1);
    if (digits.length > 10) digits = digits.slice(0, 10);
    return '+7' + digits;
  };

  const handlePhoneChange = (text: string) => {
    const formatted = formatPhone(text);
    setPhone(formatted);
    if (loginErrors.phone) {
      setLoginErrors({ ...loginErrors, phone: undefined });
    }
  };

  const handleRegisterPhoneChange = (text: string) => {
    const formatted = formatPhone(text);
    setRegisterPhone(formatted);
    // Валидация в реальном времени
    if (formatted.length > 2) {
      const error = validatePhone(formatted);
      setRegisterErrors({ ...registerErrors, phone: error });
    } else if (registerErrors.phone) {
      setRegisterErrors({ ...registerErrors, phone: undefined });
    }
  };

  const handleEmailChange = (text: string) => {
    setEmail(text);
    // Валидация в реальном времени
    if (text.length > 0) {
      const error = validateEmail(text);
      setRegisterErrors({ ...registerErrors, email: error });
    } else if (registerErrors.email) {
      setRegisterErrors({ ...registerErrors, email: undefined });
    }
  };

  const handleRegisterPasswordChange = (text: string) => {
    setRegisterPassword(text);
    // Валидация в реальном времени
    if (text.length > 0) {
      const error = validatePassword(text);
      setRegisterErrors({ ...registerErrors, password: error });
      // Также проверяем совпадение паролей
      if (confirmPassword && text !== confirmPassword) {
        setRegisterErrors(prev => ({ ...prev, confirmPassword: 'Пароли не совпадают' }));
      } else if (confirmPassword && text === confirmPassword) {
        setRegisterErrors(prev => ({ ...prev, confirmPassword: undefined }));
      }
    } else if (registerErrors.password) {
      setRegisterErrors({ ...registerErrors, password: undefined });
    }
  };

  const handleConfirmPasswordChange = (text: string) => {
    setConfirmPassword(text);
    // Валидация совпадения паролей
    if (text.length > 0) {
      if (text !== registerPassword) {
        setRegisterErrors({ ...registerErrors, confirmPassword: 'Пароли не совпадают' });
      } else {
        setRegisterErrors({ ...registerErrors, confirmPassword: undefined });
      }
    } else if (registerErrors.confirmPassword) {
      setRegisterErrors({ ...registerErrors, confirmPassword: undefined });
    }
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    if (loginErrors.password) {
      setLoginErrors({ ...loginErrors, password: undefined });
    }
  };

  const handleLogin = async () => {
    if (!validateLoginForm()) {
      return;
    }

    logger.debug('auth', '🔍 [LOGIN] Начало входа', { phone });

    setLoginLoading(true);
    try {
      const loggedInUser = await login({ phone, password });
      logger.debug('auth', '✅ [LOGIN] Успешный вход!');
      const draft = await getPublicBookingDraft();
      if (isDraftValidForPostLoginRedirect(draft)) {
        router.replace(`/m/${draft.slug}` as any);
        return;
      }
      const role = (typeof loggedInUser?.role === 'string' ? loggedInUser.role : '').toLowerCase();
      router.replace(role === 'client' ? '/client/dashboard' : '/');
    } catch (error: any) {
      logger.error('❌ [LOGIN] ОШИБКА ВХОДА:', error);
      
      let errorMessage = 'Ошибка входа';
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        errorMessage = 'Не удалось подключиться к серверу. Проверьте, что backend запущен и API_URL настроен правильно.';
      } else if (error.code === 'NETWORK_ERROR' || !error.response) {
        errorMessage = 'Ошибка сети. Проверьте подключение к интернету и что backend доступен по адресу из .env';
      }
      
      Alert.alert('Ошибка входа', errorMessage);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!validateRegisterForm()) {
      return;
    }

    logger.debug('auth', '🔍 [REGISTER] Начало регистрации', { email, phone: registerPhone });

    setRegisterLoading(true);
    try {
      logger.debug('auth', '🔍 [REGISTER] Вызов register()...');
      const payload: Parameters<typeof register>[0] = {
        email,
        phone: registerPhone,
        password: registerPassword,
        full_name: fullName,
        role: userRole,
      };
      if (userRole === 'master' && (city || '').trim()) {
        payload.city = city.trim();
        payload.timezone = (timezone || getTimezoneByCity(city)).trim();
      }
      await register(payload);
      logger.debug('auth', '✅ [REGISTER] Успешная регистрация!');
      const draft = await getPublicBookingDraft();
      if (isDraftValidForPostLoginRedirect(draft)) {
        setTimeout(() => router.replace(`/m/${draft.slug}` as any), 100);
        return;
      }
      const isClient = userRole === 'client';
      setTimeout(() => {
        router.replace(isClient ? '/client/dashboard' : '/');
      }, 100);
    } catch (error: any) {
      logger.error('❌ [REGISTER] ОШИБКА РЕГИСТРАЦИИ:', error);
      
      let errorMessage = 'Ошибка регистрации';
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        errorMessage = 'Не удалось подключиться к серверу. Проверьте, что backend запущен и API_URL настроен правильно.';
      } else if (error.code === 'NETWORK_ERROR' || !error.response) {
        errorMessage = 'Ошибка сети. Проверьте подключение к интернету и что backend доступен по адресу из .env';
      }
      
      Alert.alert('Ошибка регистрации', errorMessage);
    } finally {
      setRegisterLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <ScreenContainer 
        scrollable 
        backgroundColor="#fff"
        scrollViewProps={{
          keyboardShouldPersistTaps: 'handled',
          contentContainerStyle: { flexGrow: 1, paddingBottom: 100 },
          showsVerticalScrollIndicator: true,
          bounces: true,
          keyboardDismissMode: 'on-drag',
          onScrollBeginDrag: () => Keyboard.dismiss(),
        }}
      >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <View style={styles.container}>
        <View style={styles.logoContainer}>
          <Image
            source={require('../assets/dedato_trnsp.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.subtitle}>Добро пожаловать!</Text>

        {/* Слайдер вкладок */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            testID="login-tab"
            style={[styles.tab, activeTab === 'login' && styles.tabActive]}
            onPress={() => {
              setActiveTab('login');
              // Сбрасываем ошибки при переключении
              setLoginErrors({});
            }}
          >
            <Text testID="login-screen-title" style={[styles.tabText, activeTab === 'login' && styles.tabTextActive]}>
              Вход
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="register-tab"
            style={[styles.tab, activeTab === 'register' && styles.tabActive]}
            onPress={() => {
              setActiveTab('register');
              // Сбрасываем ошибки и устанавливаем роль по умолчанию
              setRegisterErrors({});
              setUserRole('client');
            }}
          >
            <Text style={[styles.tabText, activeTab === 'register' && styles.tabTextActive]}>
              Регистрация
            </Text>
          </TouchableOpacity>
        </View>

        {/* Форма входа */}
        {activeTab === 'login' && (
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Номер телефона</Text>
              <TextInput
                testID="phone-input"
                accessibilityLabel="Номер телефона"
                accessibilityHint="Введите номер телефона"
                style={[styles.input, loginErrors.phone && styles.inputError]}
                placeholder="+7 (999) 999 99 99"
                value={phone}
                onChangeText={handlePhoneChange}
                keyboardType="phone-pad"
                autoCapitalize="none"
                editable={!loginLoading}
              />
              {loginErrors.phone && <Text style={styles.errorText}>{loginErrors.phone}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Пароль</Text>
              <TextInput
                testID="password-input"
                accessibilityLabel="Пароль"
                accessibilityHint="Введите пароль"
                style={[styles.input, loginErrors.password && styles.inputError]}
                placeholder="Пароль"
                value={password}
                onChangeText={handlePasswordChange}
                secureTextEntry
                autoCapitalize="none"
                editable={!loginLoading}
              />
              {loginErrors.password && <Text style={styles.errorText}>{loginErrors.password}</Text>}
            </View>

            <TouchableOpacity
              testID="login-button"
              accessibilityLabel="Войти"
              accessibilityRole="button"
              style={[styles.button, loginLoading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loginLoading}
            >
              {loginLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Войти</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Форма регистрации */}
        {activeTab === 'register' && (
          <View style={styles.form}>
            {/* Выбор типа аккаунта */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Тип аккаунта</Text>
              <View style={styles.roleSelector}>
                <TouchableOpacity
                  style={[
                    styles.roleOption,
                    userRole === 'client' && styles.roleOptionActive,
                    registerErrors.role && styles.roleOptionError,
                  ]}
                  onPress={() => {
                    setUserRole('client');
                    setCity('');
                    setTimezone('');
                    if (registerErrors.role) {
                      setRegisterErrors({ ...registerErrors, role: undefined });
                    }
                    if (registerErrors.city) setRegisterErrors((e) => ({ ...e, city: undefined }));
                  }}
                  disabled={registerLoading}
                >
                  <View style={styles.roleOptionTitleRow}>
                    <Ionicons
                      name="person-outline"
                      size={18}
                      color={userRole === 'client' ? '#4CAF50' : '#666'}
                      style={styles.roleOptionIcon}
                    />
                    <Text style={[
                      styles.roleOptionText,
                      userRole === 'client' && styles.roleOptionTextActive
                    ]}>
                      Клиент
                    </Text>
                  </View>
                  <Text style={[
                    styles.roleOptionDescription,
                    userRole === 'client' && styles.roleOptionDescriptionActive
                  ]}>
                    Запись на услуги
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="role-master"
                  style={[
                    styles.roleOption,
                    userRole === 'master' && styles.roleOptionActive,
                    registerErrors.role && styles.roleOptionError,
                  ]}
                  onPress={() => {
                    setUserRole('master');
                    if (registerErrors.role) {
                      setRegisterErrors({ ...registerErrors, role: undefined });
                    }
                    if (registerErrors.city) setRegisterErrors((e) => ({ ...e, city: undefined }));
                  }}
                  disabled={registerLoading}
                >
                  <View style={styles.roleOptionTitleRow}>
                    <Ionicons
                      name="cut-outline"
                      size={18}
                      color={userRole === 'master' ? '#4CAF50' : '#666'}
                      style={styles.roleOptionIcon}
                    />
                    <Text style={[
                      styles.roleOptionText,
                      userRole === 'master' && styles.roleOptionTextActive
                    ]}>
                      Мастер
                    </Text>
                  </View>
                  <Text style={[
                    styles.roleOptionDescription,
                    userRole === 'master' && styles.roleOptionDescriptionActive
                  ]}>
                    Предоставление услуг
                  </Text>
                </TouchableOpacity>
              </View>
              {registerErrors.role && <Text style={styles.errorText}>{registerErrors.role}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Имя</Text>
              <TextInput
                testID="full-name-input"
                style={[styles.input, registerErrors.fullName && styles.inputError]}
                placeholder="Иван Иванов"
                value={fullName}
                onChangeText={(text) => {
                  setFullName(text);
                  if (registerErrors.fullName) {
                    setRegisterErrors({ ...registerErrors, fullName: undefined });
                  }
                }}
                autoCapitalize="words"
                editable={!registerLoading}
              />
              {registerErrors.fullName && <Text style={styles.errorText}>{registerErrors.fullName}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                testID="email-input"
                style={[styles.input, registerErrors.email && styles.inputError]}
                placeholder="example@mail.com"
                value={email}
                onChangeText={handleEmailChange}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!registerLoading}
              />
              {registerErrors.email && <Text style={styles.errorText}>{registerErrors.email}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Номер телефона</Text>
              <TextInput
                testID="register-phone-input"
                style={[styles.input, registerErrors.phone && styles.inputError]}
                placeholder="+7 (999) 999 99 99"
                value={registerPhone}
                onChangeText={handleRegisterPhoneChange}
                keyboardType="phone-pad"
                autoCapitalize="none"
                editable={!registerLoading}
              />
              {registerErrors.phone && <Text style={styles.errorText}>{registerErrors.phone}</Text>}
            </View>

            {userRole === 'master' && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Город <Text style={{ color: '#dc2626' }}>*</Text></Text>
                <TouchableOpacity
                  style={[styles.input, styles.cityTouchable, registerErrors.city && styles.inputError]}
                  onPress={() => !registerLoading && setShowCityModal(true)}
                  disabled={registerLoading}
                >
                  <Text style={[styles.cityTouchableText, !city && styles.cityPlaceholder]}>
                    {city || 'Выберите город'}
                  </Text>
                </TouchableOpacity>
                {registerErrors.city && <Text style={styles.errorText}>{registerErrors.city}</Text>}
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Пароль</Text>
              <View style={[styles.passwordInputContainer, registerErrors.password && styles.passwordInputContainerError]}>
                <TextInput
                  testID="register-password-input"
                  style={styles.passwordInput}
                  placeholder="Минимум 6 символов"
                  value={registerPassword}
                  onChangeText={handleRegisterPasswordChange}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  editable={!registerLoading}
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={() => setShowPassword(!showPassword)}
                  disabled={registerLoading}
                >
                  <View style={styles.eyeIconContainer}>
                    {showPassword ? (
                      <View style={styles.eyeIconOpen}>
                        <View style={styles.eyeIconPupil} />
                      </View>
                    ) : (
                      <View style={styles.eyeIconClosed}>
                        <View style={styles.eyeIconLine} />
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              </View>
              {registerErrors.password && <Text style={styles.errorText}>{registerErrors.password}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Подтвердите пароль</Text>
              <View style={[styles.passwordInputContainer, registerErrors.confirmPassword && styles.passwordInputContainerError]}>
                <TextInput
                  testID="confirm-password-input"
                  style={styles.passwordInput}
                  placeholder="Повторите пароль"
                  value={confirmPassword}
                  onChangeText={handleConfirmPasswordChange}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  editable={!registerLoading}
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={registerLoading}
                >
                  <View style={styles.eyeIconContainer}>
                    {showConfirmPassword ? (
                      <View style={styles.eyeIconOpen}>
                        <View style={styles.eyeIconPupil} />
                      </View>
                    ) : (
                      <View style={styles.eyeIconClosed}>
                        <View style={styles.eyeIconLine} />
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              </View>
              {registerErrors.confirmPassword && <Text style={styles.errorText}>{registerErrors.confirmPassword}</Text>}
            </View>

            {/* Чекбоксы согласий */}
            <View style={styles.checkboxGroup}>
              <TouchableOpacity
                testID="agreement-checkbox"
                style={styles.checkboxRow}
                onPress={() => {
                  setAgree(!agree);
                  if (registerErrors.agree) {
                    setRegisterErrors({ ...registerErrors, agree: undefined });
                  }
                }}
                disabled={registerLoading}
              >
                <View style={[styles.checkbox, agree && styles.checkboxChecked]}>
                  {agree && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={styles.checkboxLabel}>
                  Нажимая на кнопку Зарегистрироваться, я подтверждаю свое согласие с{' '}
                  <Text style={styles.checkboxLink}>условиями пользовательского соглашения</Text>
                  {' '}и даю согласие на обработку персональных данных{' '}
                  <Text style={styles.required}>*</Text>
                </Text>
              </TouchableOpacity>
              {registerErrors.agree && <Text style={styles.errorText}>{registerErrors.agree}</Text>}
            </View>

            <View style={styles.checkboxGroup}>
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setInfoAgree(!infoAgree)}
                disabled={registerLoading}
              >
                <View style={[styles.checkbox, infoAgree && styles.checkboxChecked]}>
                  {infoAgree && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={styles.checkboxLabel}>
                  Я даю согласие на получение информационных сообщений
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              testID="register-button"
              style={[styles.button, (registerLoading || !agree || (userRole === 'master' && !(city || '').trim())) && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={registerLoading || !agree || (userRole === 'master' && !(city || '').trim())}
            >
              {registerLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Зарегистрироваться</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

            <Modal visible={showCityModal} transparent animationType="slide">
              <TouchableOpacity
                style={styles.cityModalBackdrop}
                activeOpacity={1}
                onPress={() => setShowCityModal(false)}
              />
              <View style={styles.cityModalContent}>
                <View style={styles.cityModalHeader}>
                  <Text style={styles.cityModalTitle}>Выберите город</Text>
                  <TouchableOpacity onPress={() => setShowCityModal(false)}>
                    <Text style={styles.cityModalClose}>Закрыть</Text>
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={cities}
                  keyExtractor={(item) => item.name}
                  style={styles.cityModalList}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.cityModalItem}
                      onPress={() => {
                        setCity(item.name);
                        setTimezone(getTimezoneByCity(item.name));
                        setShowCityModal(false);
                        if (registerErrors.city) {
                          setRegisterErrors((e) => ({ ...e, city: undefined }));
                        }
                      }}
                    >
                      <Text style={styles.cityModalItemText}>{item.name}</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            </Modal>
              </View>
            </TouchableWithoutFeedback>
          </ScreenContainer>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    paddingTop: 60,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    marginTop: 20,
  },
  logo: {
    width: 120,
    height: 120,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#4CAF50',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: '#fff',
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  passwordInputContainerError: {
    borderColor: '#f00',
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    paddingRight: 4,
    fontSize: 16,
  },
  eyeIcon: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeIconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeIconOpen: {
    width: 20,
    height: 12,
    borderWidth: 2,
    borderColor: '#666',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeIconPupil: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#666',
  },
  eyeIconClosed: {
    width: 20,
    height: 2,
    borderTopWidth: 2,
    borderTopColor: '#666',
    borderRadius: 1,
    position: 'relative',
  },
  eyeIconLine: {
    width: 20,
    height: 2,
    backgroundColor: '#666',
    borderRadius: 1,
  },
  inputError: {
    borderColor: '#f00',
  },
  errorText: {
    color: '#f00',
    fontSize: 12,
    marginTop: 4,
  },
  button: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  roleSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  roleOption: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 55,
    backgroundColor: '#fff',
  },
  roleOptionActive: {
    borderColor: '#4CAF50',
    backgroundColor: '#f0f8f0',
  },
  roleOptionError: {
    borderColor: '#f00',
  },
  roleOptionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleOptionIcon: {
    marginRight: 6,
  },
  roleOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  roleOptionTextActive: {
    color: '#4CAF50',
  },
  roleOptionDescription: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
    textAlign: 'center',
  },
  roleOptionDescriptionActive: {
    color: '#4CAF50',
  },
  checkboxGroup: {
    marginBottom: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 4,
    marginRight: 10,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  checkboxLink: {
    color: '#4CAF50',
    textDecorationLine: 'underline',
  },
  required: {
    color: '#F44336',
  },
  cityTouchable: {
    justifyContent: 'center',
  },
  cityTouchableText: {
    fontSize: 16,
    color: '#333',
  },
  cityPlaceholder: {
    color: '#999',
  },
  cityModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  cityModalContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '70%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  cityModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  cityModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  cityModalClose: {
    fontSize: 16,
    color: '#4CAF50',
  },
  cityModalList: {
    maxHeight: 400,
  },
  cityModalItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  cityModalItemText: {
    fontSize: 16,
    color: '#333',
  },
});
