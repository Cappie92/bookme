import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ClientStatus } from './notificationsTypes';

interface ClientStatusChipProps {
  status: ClientStatus;
}

export function ClientStatusChip({ status }: ClientStatusChipProps) {
  const isNew = status === 'new';
  return (
    <View style={[styles.chip, isNew ? styles.chipNew : styles.chipReturning]}>
      <Ionicons
        name={isNew ? 'person-add-outline' : 'refresh-outline'}
        size={12}
        color={isNew ? '#2F7D32' : '#5B675B'}
        style={styles.icon}
      />
      <Text style={[styles.text, isNew ? styles.textNew : styles.textReturning]}>
        {isNew ? 'Новый' : 'Повторный'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipNew: {
    backgroundColor: '#EEF8EF',
    borderColor: '#D7E8D8',
  },
  chipReturning: {
    backgroundColor: '#F2F5F2',
    borderColor: '#E1E8E1',
  },
  icon: {
    marginRight: 4,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
  },
  textNew: {
    color: '#2F7D32',
  },
  textReturning: {
    color: '#5B675B',
  },
});
