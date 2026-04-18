import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SettingsBlock } from './SettingsBlock';
import { MasterSettings } from '@src/services/api/master';

interface ClientRestrictionsBlockProps {
  settings: MasterSettings | null;
  onEdit: () => void;
}

export function ClientRestrictionsBlock({ settings, onEdit }: ClientRestrictionsBlockProps) {
  // Упрощенная версия - просто показывает информацию
  // Полный функционал будет добавлен позже
  const hasRestrictions = false; // TODO: получить из API

  return (
    <SettingsBlock title="Ограничения клиентов" onEdit={onEdit}>
      <View style={styles.content}>
        {hasRestrictions ? (
          <Text style={styles.text}>Настроены ограничения для клиентов</Text>
        ) : (
          <Text style={styles.text}>Ограничения не настроены</Text>
        )}
        <Text style={styles.hint}>
          Нажмите на иконку редактирования, чтобы настроить ограничения
        </Text>
      </View>
    </SettingsBlock>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: 8,
  },
  text: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
});


