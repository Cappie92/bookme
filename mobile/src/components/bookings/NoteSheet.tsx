import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface NoteSheetProps {
  visible: boolean;
  onClose: () => void;
  content: string | null | undefined;
  loading?: boolean;
  title?: string;
  emptyText?: string;
}

export function NoteSheet({ visible, onClose, content, loading = false, title = 'Заметка', emptyText = 'Заметки нет' }: NoteSheetProps) {
  const displayText =
    loading ? 'Загрузка…' :
    content?.trim() ? content.trim() : emptyText;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color="#666" />
            </TouchableOpacity>
          </View>
          <View style={styles.content}>
            <Text style={styles.contentText}>{displayText}</Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    width: '100%',
    maxHeight: '50%',
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    padding: 16,
    paddingTop: 16,
  },
  contentText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
});
