import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';

interface SettingsRowProps {
  label: string;
  description?: string;
  onPress?: () => void;
  rightElement?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

export default function SettingsRow({
  label,
  description,
  onPress,
  rightElement,
  danger = false,
  disabled = false,
}: SettingsRowProps) {
  const content = (
    <View style={[styles.row, disabled && styles.rowDisabled]}>
      <View style={styles.leftContent}>
        <Text style={[styles.label, danger && styles.labelDanger]}>
          {label}
        </Text>
        {description && (
          <Text style={styles.description}>{description}</Text>
        )}
      </View>
      <View style={styles.rightContent}>
        {rightElement || (onPress && <Ionicons name="chevron-forward" size={22} color="#999" />)}
      </View>
    </View>
  );

  if (onPress && !disabled) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={styles.container}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={styles.container}>{content}</View>;
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  leftContent: {
    flex: 1,
    marginRight: 12,
  },
  label: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  labelDanger: {
    color: '#F44336',
  },
  description: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  rightContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

