import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Platform,
  Dimensions,
  KeyboardAvoidingView,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useModalKeyboardHeight } from '@src/hooks/useModalKeyboardHeight';

const WINDOW_HEIGHT = Dimensions.get('window').height;
const MODAL_SHEET_MAX_HEIGHT = Math.round(WINDOW_HEIGHT * 0.88);

export interface KeyboardAwareBottomSheetProps {
  visible: boolean;
  onRequestClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  sheetStyle?: ViewStyle;
}

/**
 * Bottom sheet с подъёмом над клавиатурой (паттерн services.tsx).
 */
export function KeyboardAwareBottomSheet({
  visible,
  onRequestClose,
  title,
  children,
  footer,
  sheetStyle,
}: KeyboardAwareBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const modalFooterPaddingBottom = Math.max(insets.bottom, 8) + 8;
  const keyboardHeight = useModalKeyboardHeight(visible);

  const sheetMaxHeight = useMemo(() => {
    if (keyboardHeight <= 0) return MODAL_SHEET_MAX_HEIGHT;
    const capped = WINDOW_HEIGHT - keyboardHeight - insets.top - 12;
    return Math.min(MODAL_SHEET_MAX_HEIGHT, Math.max(280, capped));
  }, [keyboardHeight, insets.top]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onRequestClose}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[
            styles.keyboardHost,
            Platform.OS === 'android' && keyboardHeight > 0
              ? { marginBottom: keyboardHeight }
              : null,
          ]}
        >
          <View
            style={[
              styles.sheet,
              { maxHeight: sheetMaxHeight },
              keyboardHeight > 0 ? { height: sheetMaxHeight } : null,
              sheetStyle,
            ]}
          >
            {title ? <Text style={styles.title}>{title}</Text> : null}
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              showsVerticalScrollIndicator
              nestedScrollEnabled
            >
              {children}
            </ScrollView>
            <View style={[styles.footer, { paddingBottom: modalFooterPaddingBottom }]}>{footer}</View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  keyboardHost: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    color: '#111',
  },
  scroll: {
    flexShrink: 1,
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  footer: {
    paddingTop: 8,
    gap: 10,
  },
});
