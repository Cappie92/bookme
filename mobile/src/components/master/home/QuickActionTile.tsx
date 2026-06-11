import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface QuickActionTileProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  unreadCount?: number;
}

export function QuickActionTile({ label, icon, onPress, unreadCount = 0 }: QuickActionTileProps) {
  const showIndicator = unreadCount > 0;
  const showCountBadge = unreadCount > 1;

  return (
    <TouchableOpacity
      style={styles.tile}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={label}
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
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 88,
    borderRadius: 18,
    backgroundColor: '#F7FBF7',
    borderWidth: 1,
    borderColor: '#E5EEE6',
    padding: 12,
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
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F2A1F',
    lineHeight: 16,
    letterSpacing: -0.2,
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
