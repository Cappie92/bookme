import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Card } from '@src/components/Card';
import { SecondaryButton } from '@src/components/SecondaryButton';
import { FreeSlotsShareCardModal } from '@src/components/modals/FreeSlotsShareCardModal';
import { env } from '@src/config/env';
import type { MasterSettings } from '@src/services/api/master';
import {
  getPromotionUrls,
  hasPromotionSlug,
  isPromotionReady,
  shouldShowPromotionCard,
} from '@src/utils/masterHomePromotion';

export interface PromotionCardProps {
  masterSettings: MasterSettings | null;
}

export function PromotionCard({ masterSettings }: PromotionCardProps) {
  const [freeSlotsVisible, setFreeSlotsVisible] = useState(false);
  const [copyToastVisible, setCopyToastVisible] = useState(false);
  const copyToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { slug, publicBookingUrl, publicRoutePath } = useMemo(
    () => getPromotionUrls(masterSettings, env.WEB_URL),
    [masterSettings]
  );

  useEffect(
    () => () => {
      if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
    },
    []
  );

  if (!shouldShowPromotionCard(masterSettings)) {
    return null;
  }

  const ready = isPromotionReady(masterSettings, env.WEB_URL);

  const handleOpenPage = async () => {
    if (publicRoutePath) {
      router.push(publicRoutePath as `/m/${string}`);
      return;
    }
    if (publicBookingUrl) {
      try {
        const canOpen = await Linking.canOpenURL(publicBookingUrl);
        if (canOpen) {
          await Linking.openURL(publicBookingUrl);
        } else {
          Alert.alert('Ошибка', 'Не удалось открыть страницу');
        }
      } catch {
        Alert.alert('Ошибка', 'Не удалось открыть страницу');
      }
    }
  };

  const handleCopyLink = async () => {
    if (!publicBookingUrl) return;
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
  };

  if (!hasPromotionSlug(masterSettings)) {
    return (
      <Card style={styles.card}>
        <Text style={styles.title}>Продвижение</Text>
        <Text style={styles.subtitle}>Быстрые способы привести клиентов на запись</Text>
        <Text style={styles.setupText}>Настройте адрес страницы, чтобы делиться ссылкой на запись</Text>
        <SecondaryButton
          title="Перейти в настройки"
          onPress={() => router.push('/master/settings')}
          style={styles.setupCta}
        />
      </Card>
    );
  }

  return (
    <>
      <Card style={styles.card}>
        <Text style={styles.title}>Продвижение</Text>
        <Text style={styles.subtitle}>Быстрые способы привести клиентов на запись</Text>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, !ready && styles.actionBtnDisabled]}
            onPress={handleOpenPage}
            disabled={!ready}
            activeOpacity={0.75}
          >
            <Ionicons name="open-outline" size={18} color="#2e7d32" />
            <Text style={styles.actionText}>Открыть страницу мастера</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, !publicBookingUrl && styles.actionBtnDisabled]}
            onPress={handleCopyLink}
            disabled={!publicBookingUrl}
            activeOpacity={0.75}
          >
            <Ionicons name="copy-outline" size={18} color="#2e7d32" />
            <Text style={styles.actionText}>Скопировать ссылку на запись</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, !ready && styles.actionBtnDisabled]}
            onPress={() => setFreeSlotsVisible(true)}
            disabled={!ready}
            activeOpacity={0.75}
          >
            <Ionicons name="share-social-outline" size={18} color="#2e7d32" />
            <Text style={styles.actionText}>Карточка свободных слотов</Text>
          </TouchableOpacity>
        </View>

        {copyToastVisible ? (
          <Text style={styles.copyToast} accessibilityLiveRegion="polite">
            Ссылка скопирована
          </Text>
        ) : null}
      </Card>

      {slug && publicBookingUrl ? (
        <FreeSlotsShareCardModal
          visible={freeSlotsVisible}
          onClose={() => setFreeSlotsVisible(false)}
          slug={slug}
          bookingUrl={publicBookingUrl}
          masterNameFallback={masterSettings?.user?.full_name || ''}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 12,
  },
  setupText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  setupCta: {
    marginTop: 0,
  },
  actions: {
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f9faf9',
    borderWidth: 1,
    borderColor: '#e8f5e9',
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#2e7d32',
  },
  copyToast: {
    marginTop: 8,
    fontSize: 13,
    color: '#2e7d32',
    fontWeight: '500',
  },
});
