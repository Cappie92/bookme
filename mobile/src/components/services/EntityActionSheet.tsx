import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type EntityActionSheetVariant = 'actions' | 'confirm';

export type EntityActionSheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  message: string;
  variant: EntityActionSheetVariant;
  onEdit?: () => void;
  onDelete?: () => void;
  onConfirmDelete?: () => void;
  deleting?: boolean;
};

export function EntityActionSheet({
  visible,
  onClose,
  title,
  message,
  variant,
  onEdit,
  onDelete,
  onConfirmDelete,
  deleting = false,
}: EntityActionSheetProps) {
  const insets = useSafeAreaInsets();
  const paddingBottom = Math.max(insets.bottom, 8) + 8;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Закрыть" />
        <View style={[styles.sheet, { paddingBottom }]}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.message}>{message}</Text>

          {variant === 'actions' ? (
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.primaryAction}
                onPress={onEdit}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={styles.primaryActionText}>Редактировать</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.destructiveAction}
                onPress={onDelete}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={styles.destructiveActionText}>Удалить</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelAction}
                onPress={onClose}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={styles.cancelActionText}>Отмена</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.destructiveAction, deleting && styles.actionDisabled]}
                onPress={onConfirmDelete}
                disabled={deleting}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                {deleting ? (
                  <ActivityIndicator color="#F44336" />
                ) : (
                  <Text style={styles.destructiveActionText}>Удалить</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelAction}
                onPress={onClose}
                disabled={deleting}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={styles.cancelActionText}>Отмена</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    color: '#666',
    marginBottom: 16,
  },
  actions: {
    gap: 10,
  },
  primaryAction: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  destructiveAction: {
    backgroundColor: '#FFEBEE',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  destructiveActionText: {
    color: '#F44336',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelAction: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelActionText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  actionDisabled: {
    opacity: 0.6,
  },
});
