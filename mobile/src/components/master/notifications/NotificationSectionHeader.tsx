import React from 'react';
import { Text, StyleSheet } from 'react-native';

interface NotificationSectionHeaderProps {
  title: string;
}

export function NotificationSectionHeader({ title }: NotificationSectionHeaderProps) {
  return <Text style={styles.title}>{title}</Text>;
}

const styles = StyleSheet.create({
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8A948A',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
    marginLeft: 4,
  },
});
