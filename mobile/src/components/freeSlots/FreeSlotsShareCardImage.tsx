import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { env } from '@src/config/env';
import { resolveBackendUploadUrl } from '@src/utils/resolveBackendUploadUrl';

/** Как web FreeSlotsShareCardModal: CARD_W × CARD_H = 1080 × 1920 */
export const FREE_SLOTS_CARD_WIDTH = 1080;
export const FREE_SLOTS_CARD_HEIGHT = 1920;

export type FreeSlotsShareCardImageProps = {
  masterName: string;
  dateLabel: string;
  hourLabels: string[];
  shortLink: string;
  avatarUrl?: string | null;
};

export const FreeSlotsShareCardImage = forwardRef<View, FreeSlotsShareCardImageProps>(
  function FreeSlotsShareCardImage(
    { masterName, dateLabel, hourLabels, shortLink, avatarUrl },
    ref
  ) {
    const photoUri = avatarUrl ? resolveBackendUploadUrl(avatarUrl) : null;
    const webBase = (env.WEB_URL || 'https://dedato.ru').replace(/\/+$/, '');
    const logoUri = `${webBase}/dedato-logo-card.png`;

    return (
      <View ref={ref} collapsable={false} style={styles.card}>
        <Text style={styles.sectionLabel}>Свободные часы</Text>

        <View style={styles.headerRow}>
          <View style={styles.avatarBox}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <Text style={styles.avatarPlaceholder}>Нет фото</Text>
            )}
          </View>
          <View style={styles.nameCol}>
            <Text style={styles.masterName} numberOfLines={3}>
              {masterName}
            </Text>
          </View>
        </View>

        <View style={styles.greenLine} />

        {dateLabel ? (
          <Text style={styles.dateLabel}>{dateLabel}</Text>
        ) : null}

        <View style={styles.slotsCol}>
          {hourLabels.map((label, i) => (
            <View key={`${label}-${i}`} style={styles.slotPill}>
              <Text style={styles.slotPillText}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>
              Запись:{' '}
              <Text style={styles.footerLink}>{shortLink || 'dedato.ru/m/…'}</Text>
            </Text>
            <Image
              source={{ uri: logoUri }}
              style={styles.logo}
              contentFit="contain"
              accessibilityLabel="DeDato"
            />
          </View>
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  card: {
    width: FREE_SLOTS_CARD_WIDTH,
    height: FREE_SLOTS_CARD_HEIGHT,
    backgroundColor: '#f9f7f6',
    padding: 56,
    flexDirection: 'column',
  },
  sectionLabel: {
    fontSize: 28,
    color: '#6b7280',
    fontWeight: '500',
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    gap: 32,
    alignItems: 'flex-start',
  },
  avatarBox: {
    width: 200,
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#e5e7eb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    fontSize: 22,
    color: '#9ca3af',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  nameCol: {
    flex: 1,
    paddingTop: 8,
    minWidth: 0,
  },
  masterName: {
    fontSize: 56,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 64,
  },
  greenLine: {
    marginTop: 48,
    height: 6,
    width: 112,
    backgroundColor: '#4CAF50',
    borderRadius: 999,
  },
  dateLabel: {
    marginTop: 56,
    fontSize: 44,
    fontWeight: '600',
    color: '#1f2937',
    lineHeight: 52,
    textTransform: 'capitalize',
  },
  slotsCol: {
    marginTop: 56,
    gap: 20,
  },
  slotPill: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  slotPillText: {
    fontSize: 52,
    fontWeight: '600',
    color: '#111827',
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 64,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 40,
  },
  footerText: {
    flex: 1,
    fontSize: 32,
    color: '#6b7280',
    lineHeight: 44,
  },
  footerLink: {
    color: '#2f7d32',
    fontWeight: '600',
  },
  logo: {
    width: 200,
    height: 84,
  },
});
