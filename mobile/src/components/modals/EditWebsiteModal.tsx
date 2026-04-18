import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
  Image,
  type ImageStyle,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../PrimaryButton';
import { MasterSettings, putMasterProfileFormData } from '@src/services/api/master';
import { env } from '@src/config/env';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { resolveBackendUploadUrl } from '@src/utils/resolveBackendUploadUrl';
import { logger } from '@src/utils/logger';

type PickerAsset = { uri: string; fileName?: string | null; fileSize?: number | null };

/**
 * Сжатие/даунскейл перед multipart — снижает OOM и native crash на Android при больших снимках из галереи.
 */
async function buildPhotoUploadPayload(asset: PickerAsset): Promise<{ uri: string; name: string; type: string }> {
  try {
    const out = await manipulateAsync(
      asset.uri,
      [{ resize: { width: 1280 } }],
      { compress: 0.85, format: SaveFormat.JPEG }
    );
    return { uri: out.uri, name: 'photo.jpg', type: 'image/jpeg' };
  } catch (e) {
    logger.warn('settings', '[EditWebsiteModal] manipulateAsync failed, using original uri', e);
    const uri = asset.uri;
    const fromName = asset.fileName?.trim();
    let filename = fromName || uri.split('/').pop() || 'photo.jpg';
    if (!/\.[a-z0-9]+$/i.test(filename)) {
      filename = `${filename}.jpg`;
    }
    const match = /\.(\w+)$/.exec(filename);
    const ext = (match?.[1] || 'jpg').toLowerCase();
    const type =
      ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'heic' ? 'image/heic' : 'image/jpeg';
    return {
      uri,
      name: filename.endsWith('.') ? `${filename}jpg` : filename,
      type,
    };
  }
}

interface EditWebsiteModalProps {
  visible: boolean;
  onClose: () => void;
  settings: MasterSettings | null;
  /** После успешного PUT — обновить данные родителя (без полноэкранного loading). */
  onSave: () => void | Promise<void>;
  frontendBaseUrl?: string;
}

export function EditWebsiteModal({ 
  visible, 
  onClose, 
  settings, 
  onSave,
  frontendBaseUrl 
}: EditWebsiteModalProps) {
  const [form, setForm] = useState({
    site_description: '',
    use_photo_as_logo: false,
  });
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [logoFile, setLogoFile] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copyHintVisible, setCopyHintVisible] = useState(false);
  const copyHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentServerPhotoUri = useMemo(() => {
    if (!settings?.master) return null;
    const path = settings.master.photo || settings.master.logo;
    return resolveBackendUploadUrl(path);
  }, [settings?.master?.photo, settings?.master?.logo]);

  useEffect(() => {
    if (settings && visible) {
      setForm({
        site_description: settings.master.site_description || '',
        use_photo_as_logo: settings.master.use_photo_as_logo || false,
      });
      setLogoFile(null);
      setSaveSuccess(false);
      setImageLoadFailed(false);
    }
  }, [settings, visible]);

  useEffect(
    () => () => {
      if (copyHintTimerRef.current) clearTimeout(copyHintTimerRef.current);
      if (postSaveTimerRef.current) clearTimeout(postSaveTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (!visible) {
      setCopyHintVisible(false);
      if (copyHintTimerRef.current) {
        clearTimeout(copyHintTimerRef.current);
        copyHintTimerRef.current = null;
      }
      if (postSaveTimerRef.current) {
        clearTimeout(postSaveTimerRef.current);
        postSaveTimerRef.current = null;
      }
    }
  }, [visible]);

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Ошибка', 'Нужно разрешение на доступ к фотографиям');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: Platform.OS === 'android' ? 0.7 : 0.85,
    });

    if (!result.canceled && result.assets[0]) {
      const file = result.assets[0];
      if (file.fileSize && file.fileSize > 1572864) {
        Alert.alert('Ошибка', 'Размер файла не должен превышать 1.5 МБ');
        return;
      }
      setLogoFile(file);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('site_description', form.site_description);
      // Цвет фона убран из web UI; не пересылаем — чтобы не затирать значение в БД пустым/устаревшим полем
      formData.append('use_photo_as_logo', String(form.use_photo_as_logo));
      
      // Как в web MasterSettings (handleSavePublicProfile): фото страницы записи — поле `photo`.
      // Бэкенд игнорирует `logo`, если master.use_photo_as_logo === true, из‑за чего загрузка «логотипа» молча не сохранялась.
      if (logoFile) {
        const part = await buildPhotoUploadPayload(logoFile);
        formData.append('photo', {
          uri: part.uri,
          name: part.name,
          type: part.type,
        } as any);
      }

      if (__DEV__) {
        logger.debug('settings', '[EditWebsiteModal] PUT master/profile start', { platform: Platform.OS });
      }
      await putMasterProfileFormData(formData);
      if (__DEV__) {
        logger.debug('settings', '[EditWebsiteModal] PUT master/profile done');
      }

      // Android: отложенный refresh + таймер + expo-image часто дают пик памяти и перезапуск процесса в Expo Go.
      if (Platform.OS === 'android') {
        try {
          await Promise.resolve(onSave());
        } catch (e: unknown) {
          logger.error('settings', '[EditWebsiteModal] post-save refresh failed', e);
          const msg =
            e && typeof e === 'object' && 'message' in e && typeof (e as Error).message === 'string'
              ? (e as Error).message
              : 'Не удалось обновить список настроек';
          Alert.alert('Внимание', `${msg}. Сохранение на сервере уже выполнено.`);
        }
        onClose();
      } else {
        setSaveSuccess(true);
        if (postSaveTimerRef.current) clearTimeout(postSaveTimerRef.current);
        postSaveTimerRef.current = setTimeout(() => {
          postSaveTimerRef.current = null;
          void (async () => {
            setSaveSuccess(false);
            try {
              await Promise.resolve(onSave());
            } catch (e: unknown) {
              logger.error('settings', '[EditWebsiteModal] post-save refresh failed', e);
              const msg =
                e && typeof e === 'object' && 'message' in e && typeof (e as Error).message === 'string'
                  ? (e as Error).message
                  : 'Не удалось обновить список настроек';
              Alert.alert('Внимание', `${msg}. Сохранение на сервере уже выполнено.`);
            } finally {
              onClose();
            }
          })();
        }, 1500);
      }
    } catch (err: any) {
      Alert.alert('Ошибка', err.message || 'Не удалось сохранить настройки');
    } finally {
      setSaving(false);
    }
  };

  const normalizeBaseUrl = (base: string | undefined | null): string => {
    const b = String(base || '').trim();
    if (!b) return '';
    return b.endsWith('/') ? b.slice(0, -1) : b;
  };

  const webBase = normalizeBaseUrl(frontendBaseUrl || env.WEB_URL || 'https://dedato.ru');
  const slug = settings?.master?.domain != null ? String(settings.master.domain).trim() : '';
  const publicBookingUrl = webBase && slug ? `${webBase}/m/${slug}` : null;
  const isIOS = Platform.OS === 'ios';

  const renderPhotoPreview = (uri: string, style: ImageStyle, a11y: string, isServer: boolean) =>
    Platform.OS === 'android' ? (
      <Image
        source={{ uri }}
        style={style}
        resizeMode="cover"
        accessibilityLabel={a11y}
        {...(isServer ? { onError: () => setImageLoadFailed(true), onLoad: () => setImageLoadFailed(false) } : {})}
      />
    ) : (
      <ExpoImage
        source={{ uri }}
        style={style}
        contentFit="cover"
        accessibilityLabel={a11y}
        {...(isServer ? { onError: () => setImageLoadFailed(true), onLoad: () => setImageLoadFailed(false) } : {})}
      />
    );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Управление сайтом</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={styles.content} 
            contentContainerStyle={styles.contentContainer}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}
          >
            <View style={styles.form}>
              {publicBookingUrl && (
                <View style={styles.field}>
                  <Text style={styles.label}>Адрес сайта для записи</Text>
                  <View style={styles.domainContainer}>
                    <Text style={styles.domainText} numberOfLines={1}>{publicBookingUrl}</Text>
                    <TouchableOpacity
                      style={styles.copyButton}
                      onPress={async () => {
                        if (!publicBookingUrl) return;
                        try {
                          await Clipboard.setStringAsync(publicBookingUrl);
                          if (copyHintTimerRef.current) clearTimeout(copyHintTimerRef.current);
                          setCopyHintVisible(true);
                          copyHintTimerRef.current = setTimeout(() => {
                            setCopyHintVisible(false);
                            copyHintTimerRef.current = null;
                          }, 2000);
                        } catch {
                          Alert.alert('Ошибка', 'Не удалось скопировать ссылку');
                        }
                      }}
                    >
                      <Ionicons name="copy-outline" size={22} color="#4CAF50" />
                    </TouchableOpacity>
                  </View>
                  {copyHintVisible ? (
                    <Text style={styles.copyHint} accessibilityLiveRegion="polite">
                      Скопировано
                    </Text>
                  ) : null}
                </View>
              )}

              <View style={styles.field}>
                <Text style={styles.label}>Текстовый блок для страницы записи</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={form.site_description}
                  onChangeText={(text) => setForm({ ...form, site_description: text })}
                  placeholder="Введите описание, которое будет отображаться на странице записи к вам..."
                  multiline
                  numberOfLines={4}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Фото для страницы записи</Text>

                {isIOS ? (
                  <>
                    {!logoFile?.uri && currentServerPhotoUri ? (
                      <View style={styles.iosCurrentBlock}>
                        <Text style={styles.photoSectionCaption}>Текущее на странице записи</Text>
                        {renderPhotoPreview(
                          currentServerPhotoUri,
                          styles.pickedImageIosServer,
                          'Текущее фото на странице записи',
                          true
                        )}
                        {imageLoadFailed ? (
                          <Text style={styles.hint}>
                            Превью не загрузилось (проверьте API_URL и сеть).
                          </Text>
                        ) : (
                          <Text style={styles.iosHintBelow}>
                            Чтобы заменить фото, выберите новое из галереи.
                          </Text>
                        )}
                      </View>
                    ) : null}

                    {!logoFile?.uri ? (
                      <TouchableOpacity style={styles.imageButton} onPress={handlePickImage} accessibilityRole="button">
                        <Text style={styles.imageButtonText}>Выбрать фото</Text>
                      </TouchableOpacity>
                    ) : null}

                    {logoFile?.uri ? (
                      <View
                        style={styles.iosNewPhotoCard}
                        accessible
                        accessibilityLabel="Новое фото выбрано. Сохраните, чтобы обновить страницу записи."
                      >
                        {currentServerPhotoUri ? (
                          <View style={styles.iosCompareHeader}>
                            <View style={styles.iosCompareHeaderText}>
                              <Text style={styles.photoSectionCaption}>Сейчас на сайте</Text>
                              <Text style={styles.iosCompareHint}>Будет заменено после сохранения</Text>
                            </View>
                            {renderPhotoPreview(
                              currentServerPhotoUri,
                              styles.pickedImageIosThumb,
                              'Миниатюра текущего фото на сайте',
                              false
                            )}
                          </View>
                        ) : null}

                        <View style={styles.iosNewBadge}>
                          <Text style={styles.iosNewBadgeText}>Новое фото</Text>
                        </View>
                        <Text style={styles.iosNewTitle}>Новое фото выбрано</Text>
                        <Text style={styles.iosNewSubtitle}>
                          Нажмите «Сохранить» внизу экрана — так фото появится на вашей странице записи.
                        </Text>

                        {renderPhotoPreview(
                          logoFile.uri,
                          styles.pickedImageIosNew,
                          'Предпросмотр выбранного фото',
                          false
                        )}

                        <TouchableOpacity
                          style={styles.iosPickAnotherButton}
                          onPress={handlePickImage}
                          accessibilityRole="button"
                          accessibilityLabel="Выбрать другое фото"
                        >
                          <Ionicons name="images-outline" size={18} color="#2e7d32" style={styles.iosPickAnotherIcon} />
                          <Text style={styles.iosPickAnotherText}>Выбрать другое</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <>
                    <TouchableOpacity style={styles.imageButton} onPress={handlePickImage}>
                      <Text style={styles.imageButtonText}>
                        {logoFile ? 'Изменить фото' : 'Выбрать фото'}
                      </Text>
                    </TouchableOpacity>
                    {logoFile?.uri ? (
                      <Image
                        source={{ uri: logoFile.uri }}
                        style={styles.pickedImage}
                        resizeMode="cover"
                        accessibilityLabel="Предпросмотр выбранного фото"
                      />
                    ) : currentServerPhotoUri ? (
                      <>
                        <Image
                          key={currentServerPhotoUri}
                          source={{ uri: currentServerPhotoUri }}
                          style={styles.pickedImage}
                          resizeMode="cover"
                          accessibilityLabel="Текущее фото на странице записи"
                          onError={() => setImageLoadFailed(true)}
                          onLoad={() => setImageLoadFailed(false)}
                        />
                        {imageLoadFailed ? (
                          <Text style={styles.hint}>
                            Превью не загрузилось (часто: HTTP без cleartext на Android или недоступный API_URL).
                          </Text>
                        ) : null}
                      </>
                    ) : null}
                    {logoFile && !logoFile.uri ? (
                      <Text style={styles.hint}>Выбрано: {logoFile.fileName || 'фото'}</Text>
                    ) : null}
                  </>
                )}
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {saveSuccess && (
              <View style={styles.successMessage}>
                <Ionicons name="checkmark-circle" size={18} color="#4CAF50" style={styles.successIcon} />
                <Text style={styles.successText}>Настройки успешно сохранены</Text>
              </View>
            )}
            <View style={styles.buttons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={onClose}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>Отмена</Text>
              </TouchableOpacity>
              <PrimaryButton
                title="Сохранить"
                onPress={handleSave}
                loading={saving}
                style={styles.saveButton}
              />
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flexGrow: 1,
  },
  contentContainer: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  form: {
    padding: 20,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  domainContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f9f9f9',
  },
  domainText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  copyButton: {
    padding: 4,
  },
  copyHint: {
    marginTop: 8,
    fontSize: 13,
    color: '#2e7d32',
    fontWeight: '600',
  },
  imageButton: {
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    backgroundColor: '#f0f9f0',
  },
  imageButtonText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '600',
  },
  pickedImage: {
    width: 120,
    height: 120,
    borderRadius: 8,
    marginTop: 12,
    backgroundColor: '#e8e8e8',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
  },
  photoSectionCaption: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  iosCurrentBlock: {
    marginBottom: 12,
  },
  iosHintBelow: {
    fontSize: 13,
    color: '#666',
    marginTop: 10,
    lineHeight: 18,
  },
  pickedImageIosServer: {
    width: 132,
    height: 132,
    borderRadius: 10,
    marginTop: 8,
    backgroundColor: '#e8e8e8',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    alignSelf: 'flex-start',
  },
  iosNewPhotoCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#b2dfdb',
    backgroundColor: '#f4fbf8',
  },
  iosCompareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#c8e6c9',
  },
  iosCompareHeaderText: {
    flex: 1,
    marginRight: 12,
  },
  iosCompareHint: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
    lineHeight: 18,
  },
  pickedImageIosThumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#e8e8e8',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
  },
  iosNewBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#2e7d32',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  iosNewBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  iosNewTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1b5e20',
    marginTop: 12,
  },
  iosNewSubtitle: {
    fontSize: 14,
    color: '#555',
    marginTop: 6,
    lineHeight: 20,
    marginBottom: 4,
  },
  pickedImageIosNew: {
    width: '100%',
    maxWidth: 280,
    height: 200,
    alignSelf: 'center',
    borderRadius: 12,
    marginTop: 8,
    backgroundColor: '#e0e0e0',
    borderWidth: 1,
    borderColor: '#81c784',
  },
  iosPickAnotherButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#4CAF50',
    backgroundColor: '#fff',
  },
  iosPickAnotherIcon: {
    marginRight: 8,
  },
  iosPickAnotherText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2e7d32',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  successMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  successIcon: {
    marginRight: 8,
  },
  successText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
  },
});

