import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMasterClients, type MasterClientListItem } from '@src/services/api/master';
import { masterClientDisplayName } from '@src/utils/clientPhone';

export interface MasterClientPhonePickerFieldProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  /** false при редактировании существующей записи с фиксированным телефоном */
  editable?: boolean;
  onClientSelected?: (client: MasterClientListItem) => void;
}

export function MasterClientPhonePickerField({
  label = 'Клиент',
  placeholder = 'Выберите клиента или введите телефон',
  value,
  onChangeText,
  editable = true,
  onClientSelected,
}: MasterClientPhonePickerFieldProps) {
  const insets = useSafeAreaInsets();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [clients, setClients] = useState<MasterClientListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadClients = useCallback(async (q?: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getMasterClients({
        q: q?.trim() || undefined,
        sort_by: 'last_visit_at',
        sort_dir: 'desc',
      });
      setClients(data);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
        (e as Error)?.message ||
        'Не удалось загрузить клиентов';
      setLoadError(msg);
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!pickerVisible) return;
    const timer = setTimeout(() => {
      loadClients(search);
    }, search.trim() ? 300 : 0);
    return () => clearTimeout(timer);
  }, [pickerVisible, search, loadClients]);

  const openPicker = () => {
    setSearch('');
    setPickerVisible(true);
  };

  const closePicker = () => {
    setPickerVisible(false);
    setSearch('');
  };

  const selectClient = (client: MasterClientListItem) => {
    onChangeText(client.client_phone);
    onClientSelected?.(client);
    closePicker();
  };

  const listPaddingBottom = Math.max(insets.bottom, 8) + 16;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, !editable && styles.inputDisabled]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#999"
        keyboardType="phone-pad"
        editable={editable}
      />
      {editable && (
        <TouchableOpacity
          style={styles.pickButton}
          onPress={openPicker}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Выбрать клиента из списка"
        >
          <Ionicons name="people-outline" size={18} color="#4CAF50" />
          <Text style={styles.pickButtonText}>Выбрать из списка</Text>
        </TouchableOpacity>
      )}

      <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={closePicker}>
        <Pressable style={styles.overlay} onPress={closePicker}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Клиенты</Text>
              <TouchableOpacity onPress={closePicker} hitSlop={8}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Поиск по имени или телефону"
              placeholderTextColor="#999"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            {loading ? (
              <ActivityIndicator style={styles.loader} color="#4CAF50" />
            ) : loadError ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>{loadError}</Text>
                <TouchableOpacity onPress={() => loadClients(search)}>
                  <Text style={styles.retryText}>Повторить</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={clients}
                keyExtractor={(item) => item.client_key}
                keyboardShouldPersistTaps="handled"
                style={styles.list}
                contentContainerStyle={
                  clients.length === 0
                    ? [styles.emptyWrap, { paddingBottom: listPaddingBottom }]
                    : { paddingBottom: listPaddingBottom }
                }
                ListEmptyComponent={
                  <Text style={styles.emptyText}>
                    {search.trim() ? 'Никого не найдено' : 'Список клиентов пуст'}
                  </Text>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.clientRow} onPress={() => selectClient(item)}>
                    <Text style={styles.clientName}>
                      {masterClientDisplayName(item.master_client_name, item.client_phone)}
                    </Text>
                    <Text style={styles.clientPhone}>{item.client_phone}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  inputDisabled: {
    backgroundColor: '#f5f5f5',
    color: '#666',
  },
  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 8,
  },
  pickButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '75%',
    minHeight: 280,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  searchInput: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  list: {
    flexGrow: 0,
  },
  clientRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  clientName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    marginBottom: 2,
  },
  clientPhone: {
    fontSize: 13,
    color: '#666',
  },
  loader: {
    marginVertical: 24,
  },
  emptyWrap: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  retryText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
});
