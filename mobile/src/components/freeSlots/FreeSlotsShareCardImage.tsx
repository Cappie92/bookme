import React, { forwardRef, useMemo } from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { getPublicAppLinkOrigin } from '@src/config/publicAppLinkOrigin';
import { resolveBackendUploadUrl } from '@src/utils/resolveBackendUploadUrl';

/** Как web FreeSlotsShareCardModal: CARD_W × CARD_H = 1080 × 1920 */
export const FREE_SLOTS_CARD_WIDTH = 1080;
export const FREE_SLOTS_CARD_HEIGHT = 1920;

export type FreeSlotsCardLayoutMode = 'capture' | 'preview';

export type FreeSlotsShareCardImageProps = {
  masterName: string;
  dateLabel: string;
  hourLabels: string[];
  shortLink: string;
  avatarUrl?: string | null;
  layoutMode?: FreeSlotsCardLayoutMode;
  /** Ширина preview (только layoutMode=preview). */
  previewWidth?: number;
};

function scaleValue(value: number, scale: number): number {
  return Math.round(value * scale);
}

function buildScaledStyles(scale: number) {
  const s = (n: number) => scaleValue(n, scale);
  return StyleSheet.create({
    card: {
      backgroundColor: '#f9f7f6',
      padding: s(56),
      flexDirection: 'column',
    },
    sectionLabel: {
      fontSize: s(28),
      color: '#6b7280',
      fontWeight: '500',
      marginBottom: s(24),
    },
    headerRow: {
      flexDirection: 'row',
      gap: s(32),
      alignItems: 'flex-start',
    },
    avatarBox: {
      width: s(200),
      height: s(200),
      borderRadius: s(16),
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
      fontSize: s(22),
      color: '#9ca3af',
      textAlign: 'center',
      paddingHorizontal: s(16),
    },
    nameCol: {
      flex: 1,
      paddingTop: s(8),
      minWidth: 0,
    },
    masterName: {
      fontSize: s(56),
      fontWeight: '700',
      color: '#111827',
      lineHeight: s(64),
    },
    greenLine: {
      marginTop: s(48),
      height: Math.max(2, s(6)),
      width: s(112),
      backgroundColor: '#4CAF50',
      borderRadius: 999,
    },
    dateLabel: {
      marginTop: s(56),
      fontSize: s(44),
      fontWeight: '600',
      color: '#1f2937',
      lineHeight: s(52),
      textTransform: 'capitalize',
    },
    slotsCol: {
      marginTop: s(56),
      gap: s(20),
    },
    slotPill: {
      backgroundColor: '#ffffff',
      borderWidth: Math.max(1, s(2)),
      borderColor: '#e5e7eb',
      borderRadius: s(16),
      paddingVertical: s(24),
      paddingHorizontal: s(32),
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: s(4),
      shadowOffset: { width: 0, height: s(2) },
      elevation: 2,
    },
    slotPillText: {
      fontSize: s(52),
      fontWeight: '600',
      color: '#111827',
    },
    footer: {
      marginTop: 'auto',
      paddingTop: s(64),
    },
    footerRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: s(40),
    },
    footerText: {
      flex: 1,
      fontSize: s(32),
      color: '#6b7280',
      lineHeight: s(44),
    },
    footerLink: {
      color: '#2f7d32',
      fontWeight: '600',
    },
    logo: {
      width: s(200),
      height: s(84),
    },
  });
}

export const FreeSlotsShareCardImage = forwardRef<View, FreeSlotsShareCardImageProps>(
  function FreeSlotsShareCardImage(
    {
      masterName,
      dateLabel,
      hourLabels,
      shortLink,
      avatarUrl,
      layoutMode = 'capture',
      previewWidth = 320,
    },
    ref
  ) {
    const photoUri = avatarUrl ? resolveBackendUploadUrl(avatarUrl) : null;
    const webBase = getPublicAppLinkOrigin();
    const logoUri = `${webBase}/dedato-logo-card.png`;

    const scale =
      layoutMode === 'capture' ? 1 : Math.max(0.2, previewWidth / FREE_SLOTS_CARD_WIDTH);
    const scaledStyles = useMemo(() => buildScaledStyles(scale), [scale]);

    const cardSizeStyle: ViewStyle =
      layoutMode === 'capture'
        ? { width: FREE_SLOTS_CARD_WIDTH, height: FREE_SLOTS_CARD_HEIGHT }
        : { width: previewWidth, aspectRatio: 9 / 16 };

    return (
      <View ref={ref} collapsable={false} style={[scaledStyles.card, cardSizeStyle]}>
        <Text style={scaledStyles.sectionLabel}>Свободные часы</Text>

        <View style={scaledStyles.headerRow}>
          <View style={scaledStyles.avatarBox}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={scaledStyles.avatarImage} contentFit="cover" />
            ) : (
              <Text style={scaledStyles.avatarPlaceholder}>Нет фото</Text>
            )}
          </View>
          <View style={scaledStyles.nameCol}>
            <Text style={scaledStyles.masterName} numberOfLines={3}>
              {masterName}
            </Text>
          </View>
        </View>

        <View style={scaledStyles.greenLine} />

        {dateLabel ? <Text style={scaledStyles.dateLabel}>{dateLabel}</Text> : null}

        <View style={scaledStyles.slotsCol}>
          {hourLabels.map((label, i) => (
            <View key={`${label}-${i}`} style={scaledStyles.slotPill}>
              <Text style={scaledStyles.slotPillText}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={scaledStyles.footer}>
          <View style={scaledStyles.footerRow}>
            <Text style={scaledStyles.footerText}>
              Запись:{' '}
              <Text style={scaledStyles.footerLink}>{shortLink || 'dedato.ru/m/…'}</Text>
            </Text>
            <Image
              source={{ uri: logoUri }}
              style={scaledStyles.logo}
              contentFit="contain"
              accessibilityLabel="DeDato"
            />
          </View>
        </View>
      </View>
    );
  }
);
