import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { QuickActionTile } from './QuickActionTile';

interface QuickActionsCardProps {
  onSocialPost: () => void;
  onCopyLink: () => void;
  onNotifications: () => void;
  unreadCount?: number;
}

export function QuickActionsCard({
  onSocialPost,
  onCopyLink,
  onNotifications,
  unreadCount = 0,
}: QuickActionsCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>Быстрые действия</Text>
        <Text style={styles.subtitle}>Частые инструменты</Text>
      </View>
      <View style={styles.row}>
        <QuickActionTile
          label="Пост"
          sublabel="для соцсетей"
          accessibilityLabel="Пост для соцсетей"
          icon="sparkles-outline"
          onPress={onSocialPost}
        />
        <QuickActionTile
          label="Ссылка"
          sublabel="скопировать"
          accessibilityLabel="Скопировать ссылку"
          icon="link-outline"
          onPress={onCopyLink}
        />
        <QuickActionTile
          label="Уведомления"
          sublabel="изменения"
          accessibilityLabel="Уведомления об изменениях"
          icon="notifications-outline"
          onPress={onNotifications}
          unreadCount={unreadCount}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5ECE5',
    marginBottom: 16,
    shadowColor: '#1F2A1F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  head: {
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2A1F',
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: '#657065',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
});
