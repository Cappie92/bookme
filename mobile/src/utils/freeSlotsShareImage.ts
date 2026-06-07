import { Alert, Linking, Platform } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import {
  FREE_SLOTS_CARD_HEIGHT,
  FREE_SLOTS_CARD_WIDTH,
} from '@src/components/freeSlots/FreeSlotsShareCardImage';

export { FREE_SLOTS_CARD_WIDTH, FREE_SLOTS_CARD_HEIGHT };

/** PNG 9:16 (1080×1920) — полноразмерная карточка, без scale preview. */
export async function captureFreeSlotsCardPng(
  viewRef: RefObject<View | null>
): Promise<string> {
  if (!viewRef.current) {
    throw new Error('Превью карточки ещё не готово');
  }
  const uri = await captureRef(viewRef, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
    width: FREE_SLOTS_CARD_WIDTH,
    height: FREE_SLOTS_CARD_HEIGHT,
  });
  if (!uri) throw new Error('Не удалось сгенерировать изображение');
  return uri;
}

export async function saveImageToGallery(fileUri: string): Promise<void> {
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Нет доступа к галерее. Разрешите сохранение фото в настройках.');
  }
  await MediaLibrary.saveToLibraryAsync(fileUri);
}

export async function shareImageViaSheet(
  fileUri: string,
  dialogTitle: string
): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Общий доступ к файлам недоступен на этом устройстве');
  }
  await Sharing.shareAsync(fileUri, {
    mimeType: 'image/png',
    dialogTitle,
    UTI: 'public.png',
  });
}

export async function shareToInstagramStory(fileUri: string): Promise<'direct' | 'sheet'> {
  if (Platform.OS === 'ios') {
    const encoded = encodeURIComponent(fileUri);
    const url = `instagram-stories://share?backgroundImage=${encoded}`;
    try {
      const can = await Linking.canOpenURL(url);
      if (can) {
        await Linking.openURL(url);
        return 'direct';
      }
    } catch {
      /* fallback */
    }
  }
  await shareImageViaSheet(fileUri, 'Выберите Instagram → История');
  return 'sheet';
}

export async function shareToTelegramStory(fileUri: string): Promise<'sheet'> {
  await shareImageViaSheet(fileUri, 'Выберите Telegram → История');
  return 'sheet';
}

export function showShareError(e: unknown, fallback: string): void {
  const msg = e instanceof Error ? e.message : fallback;
  Alert.alert('Ошибка', msg);
}
