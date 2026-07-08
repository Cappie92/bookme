import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CopyLinkToastProps {
  message: string | null;
  bottomOffset?: number;
}

export function CopyLinkToast({ message, bottomOffset = 24 }: CopyLinkToastProps) {
  if (!message) return null;

  return (
    <View style={[styles.wrap, { bottom: bottomOffset }]} pointerEvents="none">
      <View style={styles.toast}>
        <View style={styles.ok}>
          <Ionicons name="checkmark" size={12} color="#fff" />
        </View>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 100,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#203123',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    maxWidth: '100%',
    shadowColor: '#162116',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 8,
  },
  ok: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#3FC36D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
});
