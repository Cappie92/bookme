/**
 * Плавающая кнопка + модалка с копируемым логом (только __DEV__).
 * DEBUG_MOBILE_ERRORS — буфер API/runtime/logger.
 * DEBUG_AUTH_TRACE — ring-buffer auth lifecycle (отдельная секция + Copy).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  clearMobileErrorCapture,
  getMobileErrorCaptureFullText,
  subscribeMobileErrorCapture,
} from './mobileErrorCapture';
import {
  clearAuthRuntimeTrace,
  getAuthRuntimeTraceText,
  isAuthRuntimeTraceEnabled,
  subscribeAuthRuntimeTrace,
} from './authRuntimeTrace';
import { env } from '@src/config/env';

function buildCombinedDebugText(): string {
  const parts: string[] = [];
  if (isAuthRuntimeTraceEnabled()) {
    parts.push('=== AUTH TRACE (DEBUG_AUTH_TRACE) ===\n');
    parts.push(getAuthRuntimeTraceText());
    parts.push('\n\n');
  }
  if (env.SHOW_DBG_FLOATING_PANEL) {
    parts.push('=== DBG ERRORS/API (DEBUG_MOBILE_ERRORS) ===\n');
    parts.push(getMobileErrorCaptureFullText());
  }
  if (parts.length === 0) return '(ничего не включено)';
  return parts.join('');
}

export function MobileErrorDebugPanel() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [, bump] = useState(0);

  useEffect(() => subscribeMobileErrorCapture(() => bump((n) => n + 1)), []);
  useEffect(() => subscribeAuthRuntimeTrace(() => bump((n) => n + 1)), []);

  const text = buildCombinedDebugText();

  const onCopy = useCallback(async () => {
    await Clipboard.setStringAsync(buildCombinedDebugText());
    Alert.alert('Скопировано', 'Полный текст (auth trace + DBG) в буфере обмена.');
  }, []);

  const onClear = useCallback(() => {
    clearMobileErrorCapture();
    clearAuthRuntimeTrace();
    bump((n) => n + 1);
  }, []);

  return (
    <>
      <View
        style={[styles.fabWrap, { bottom: 12 + insets.bottom, right: 8 }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setOpen(true)}
          accessibilityLabel="Открыть панель отладки ошибок"
        >
          <Text style={styles.fabText}>DBG</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[styles.modalRoot, { paddingTop: insets.top, maxHeight: height }]}>
          <View style={styles.toolbar}>
            <TouchableOpacity onPress={() => setOpen(false)} style={styles.toolBtn}>
              <Text style={styles.toolBtnText}>Закрыть</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClear} style={styles.toolBtn}>
              <Text style={styles.toolBtnText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onCopy} style={[styles.toolBtn, styles.toolBtnPrimary]}>
              <Text style={[styles.toolBtnText, styles.toolBtnTextPrimary]}>Copy</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            AUTH TRACE при DEBUG_AUTH_TRACE=1; DBG — при DEBUG_MOBILE_ERRORS=1. Copy объединяет включённые секции.
          </Text>
          <ScrollView
            style={[styles.scroll, { maxHeight: height - insets.top - insets.bottom - 120 }]}
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            <Text style={styles.logText} selectable>
              {text}
            </Text>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fabWrap: {
    position: 'absolute',
    zIndex: 99999,
    elevation: 99999,
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(200, 40, 40, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  fabText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  toolbar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#444',
  },
  toolBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#333',
  },
  toolBtnPrimary: {
    backgroundColor: '#2e7d32',
    marginLeft: 'auto',
  },
  toolBtnText: {
    color: '#eee',
    fontWeight: '600',
    fontSize: 14,
  },
  toolBtnTextPrimary: {
    color: '#fff',
  },
  hint: {
    color: '#aaa',
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 12,
  },
  logText: {
    color: '#e0e0e0',
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
});
