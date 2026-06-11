import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface QuickActionTileProps {
  label: string;
  sublabel?: string;
  /** Полная подпись для VoiceOver / TalkBack */
  accessibilityLabel?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  unreadCount?: number;
}

export function QuickActionTile({
  label,
  sublabel,
  accessibilityLabel,
  icon,
  onPress,
  unreadCount = 0,
}: QuickActionTileProps) {
  const showIndicator = unreadCount > 0;
  const showCountBadge = unreadCount > 1;
  const a11y = accessibilityLabel ?? (sublabel ? `${label}, ${sublabel}` : label);

  return (
    <TouchableOpacity
      style={styles.tile}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={20} color="#4CAF50" />
        {showIndicator && !showCountBadge ? <View style={styles.unreadDotOnIcon} /> : null}
        {showCountBadge ? (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.textBlock}>
        <Text
          style={styles.label}
          numberOfLines={1}
          ellipsizeMode="tail"
          {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
        >
          {label}
        </Text>
        {sublabel ? (
          <Text
            style={styles.sublabel}
            numberOfLines={1}
            ellipsizeMode="tail"
            {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
          >
            {sublabel}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 0,
    minHeight: 88,
    borderRadius: 18,
    backgroundColor: '#F7FBF7',
    borderWidth: 1,
    borderColor: '#E5EEE6',
    padding: 10,
    justifyContent: 'space-between',
    position: 'relative',
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    alignSelf: 'flex-start',
  },
  textBlock: {
    minWidth: 0,
    flexShrink: 1,
    width: '100%',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F2A1F',
    lineHeight: 14,
    letterSpacing: -0.2,
  },
  sublabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '500',
    color: '#657065',
    lineHeight: 12,
  },
  unreadDotOnIcon: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#F7FBF7',
  },
  countBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#F7FBF7',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  countBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 11,
  },
});
