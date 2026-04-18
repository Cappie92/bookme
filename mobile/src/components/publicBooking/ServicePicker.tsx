/**
 * ServicePicker — выбор услуги в модалке с accordion по категориям.
 * Категория = service.category_name || "Без категории"
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PublicService } from './types';

interface ServicePickerProps {
  visible: boolean;
  onClose: () => void;
  services: PublicService[];
  selectedService: PublicService | null;
  onSelect: (service: PublicService) => void;
}

function groupByCategory(services: PublicService[]): { name: string; services: PublicService[] }[] {
  const map = new Map<string, PublicService[]>();
  for (const s of services) {
    const cat = s.category_name?.trim() || 'Без категории';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(s);
  }
  return Array.from(map.entries()).map(([name, svcs]) => ({ name, services: svcs }));
}

export function ServicePicker({
  visible,
  onClose,
  services,
  selectedService,
  onSelect,
}: ServicePickerProps) {
  const [search, setSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (visible) {
      setSearch('');
      const gs = groupByCategory(services);
      setExpandedCategories(gs.length > 0 ? new Set([gs[0].name]) : new Set());
    }
  }, [visible, services]);

  const groups = useMemo(() => {
    let filtered = services;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = services.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.category_name || '').toLowerCase().includes(q)
      );
    }
    return groupByCategory(filtered);
  }, [services, search]);

  const isExpanded = (name: string) =>
    expandedCategories.has(name) || (groups.length === 1);

  const toggleCategory = (name: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleSelect = (s: PublicService) => {
    onSelect(s);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Выберите услугу</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color="#999" />
            <TextInput
              style={styles.searchInput}
              placeholder="Поиск по названию..."
              placeholderTextColor="#999"
              value={search}
              onChangeText={setSearch}
            />
          </View>

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            {groups.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>У мастера пока нет услуг</Text>
              </View>
            ) : (
              <>
                {groups.map((g) => (
                  <View key={g.name} style={styles.category}>
                    <TouchableOpacity
                      style={styles.categoryHeader}
                      onPress={() => toggleCategory(g.name)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.categoryTitleRow}>
                        <Text style={styles.categoryName} numberOfLines={1}>
                          {g.name}
                        </Text>
                        <View style={styles.categoryBadge}>
                          <Text style={styles.categoryBadgeText}>{g.services.length}</Text>
                        </View>
                      </View>
                      <Ionicons
                        name={isExpanded(g.name) ? 'chevron-down' : 'chevron-forward'}
                        size={18}
                        color="#666"
                        style={styles.chevron}
                      />
                    </TouchableOpacity>
                    {isExpanded(g.name) && (
                      <View style={styles.categoryContent}>
                        {g.services.map((s) => (
                          <TouchableOpacity
                            key={s.id}
                            style={[
                              styles.serviceRow,
                              selectedService?.id === s.id && styles.serviceRowSelected,
                            ]}
                            onPress={() => handleSelect(s)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.serviceName} numberOfLines={1}>
                              {s.name}
                            </Text>
                            <Text style={styles.serviceMeta}>
                              {s.duration} мин · {s.price} ₽
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 4,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  category: {
    marginBottom: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  categoryTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  categoryName: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#6b7280',
  },
  categoryBadge: {
    paddingHorizontal: 6,
    minWidth: 22,
    height: 20,
    borderRadius: 6,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4b5563',
  },
  chevron: {
    marginLeft: 'auto',
  },
  categoryContent: {
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  serviceRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  serviceRowSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#e8f5e9',
  },
  serviceName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
  serviceMeta: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  emptyWrap: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
  },
});
