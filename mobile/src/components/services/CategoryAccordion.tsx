import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MasterServiceCategory, MasterService } from '@src/services/api/master';

interface CategoryAccordionProps {
  category: MasterServiceCategory;
  services: MasterService[];
  isExpanded: boolean;
  onToggle: () => void;
  onCategoryMenuPress: (category: MasterServiceCategory) => void;
  renderService: (service: MasterService) => React.ReactNode;
  onCreateService?: () => void;
}

export function CategoryAccordion({
  category,
  services,
  isExpanded,
  onToggle,
  onCategoryMenuPress,
  renderService,
  onCreateService,
}: CategoryAccordionProps) {
  const isUncategorized = category.id === 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerToggle}
          onPress={onToggle}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
        >
          <Text style={styles.categoryName} numberOfLines={1}>
            {category.name}
          </Text>
          <Text style={styles.categoryCount}> · {services.length}</Text>
          <View style={styles.headerToggleSpacer} />
          <Ionicons
            name={isExpanded ? 'chevron-down' : 'chevron-forward'}
            size={18}
            color="#666"
          />
        </TouchableOpacity>
        {!isUncategorized ? (
          <TouchableOpacity
            style={styles.overflowButton}
            onPress={() => onCategoryMenuPress(category)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color="#666" />
          </TouchableOpacity>
        ) : null}
      </View>
      
      {isExpanded && (
        <View style={styles.content}>
          {services.length > 0 ? (
            services.map(service => (
              <View key={service.id}>
                {renderService(service)}
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>В этой категории пока нет услуг</Text>
              {onCreateService && (
                <TouchableOpacity
                  style={styles.addServiceButton}
                  onPress={onCreateService}
                >
                  <Text style={styles.addServiceButtonText}>+ Услуга</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8f8f8',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 28,
    paddingRight: 4,
  },
  headerToggleSpacer: {
    flex: 1,
    minWidth: 8,
  },
  overflowButton: {
    padding: 4,
    marginLeft: 4,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flexShrink: 1,
  },
  categoryCount: {
    fontSize: 14,
    color: '#666',
    flexShrink: 0,
  },
  content: {
    paddingVertical: 4,
  },
  emptyState: {
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  addServiceButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
    alignSelf: 'center',
  },
  addServiceButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

