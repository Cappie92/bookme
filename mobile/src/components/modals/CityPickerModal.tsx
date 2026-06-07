import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  FlatList,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cities } from '@src/data/cities';
import { useModalKeyboardHeight } from '@src/hooks/useModalKeyboardHeight';
import { PrimaryButton } from '../PrimaryButton';

const WINDOW_HEIGHT = Dimensions.get('window').height;
const SHEET_MAX = Math.round(WINDOW_HEIGHT * 0.88);

interface CityPickerModalProps {
  visible: boolean;
  selectedCity: string;
  onClose: () => void;
  onSelect: (cityName: string) => void;
}

export function CityPickerModal({ visible, selectedCity, onClose, onSelect }: CityPickerModalProps) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useModalKeyboardHeight(visible);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState(selectedCity);
  const searchRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setDraft(selectedCity);
      setSearch('');
    }
  }, [visible, selectedCity]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cities;
    return cities.filter((c) => c.name.toLowerCase().includes(q));
  }, [search]);

  const sheetMaxHeight = useMemo(() => {
    if (keyboardHeight <= 0) return SHEET_MAX;
    const capped = WINDOW_HEIGHT - keyboardHeight - insets.top - 12;
    return Math.min(SHEET_MAX, Math.max(320, capped));
  }, [keyboardHeight, insets.top]);

  const focusSearch = () => {
    const delay = Platform.OS === 'android' ? 260 : 80;
    setTimeout(() => searchRef.current?.focus(), delay);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
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
          <View style={[styles.sheet, { maxHeight: sheetMaxHeight, height: sheetMaxHeight }]}>
            <Text style={styles.title}>Выбор города</Text>
            <TextInput
              ref={searchRef}
              style={styles.search}
              value={search}
              onChangeText={setSearch}
              placeholder="Поиск города..."
              autoCapitalize="words"
              autoCorrect={false}
              onFocus={focusSearch}
            />
            {draft ? <Text style={styles.selectedHint}>Выбрано: {draft}</Text> : null}
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.name}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const active = draft === item.name;
                return (
                  <TouchableOpacity
                    style={[styles.row, active && styles.rowActive]}
                    onPress={() => setDraft(item.name)}
                  >
                    <Text style={[styles.rowText, active && styles.rowTextActive]}>{item.name}</Text>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={styles.empty}>Город не найден</Text>}
            />
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 8) + 8 }]}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelText}>Отмена</Text>
              </TouchableOpacity>
              <PrimaryButton
                title="Выбрать"
                onPress={() => {
                  if (draft.trim()) {
                    onSelect(draft.trim());
                    onClose();
                  }
                }}
                disabled={!draft.trim()}
                style={styles.okBtn}
              />
            </View>
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
  search: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  selectedHint: {
    fontSize: 13,
    color: '#2e7d32',
    marginBottom: 8,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 8,
  },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  rowActive: {
    backgroundColor: '#E8F5E9',
    borderRadius: 6,
  },
  rowText: {
    fontSize: 16,
    color: '#333',
  },
  rowTextActive: {
    color: '#2e7d32',
    fontWeight: '600',
  },
  empty: {
    padding: 16,
    textAlign: 'center',
    color: '#888',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  okBtn: {
    flex: 1,
  },
});
