import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MasterService } from '@src/services/api/master';
import { formatMoney } from '@src/utils/money';

interface ServiceRowProps {
  service: MasterService;
  onMenuPress: (service: MasterService) => void;
}

export function ServiceRow({ service, onMenuPress }: ServiceRowProps) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.leftSection}>
          <Text style={styles.serviceName} numberOfLines={1}>
            {service.name}
          </Text>
        </View>
        <View style={styles.rightSection}>
          <View style={styles.priceDurationContainer}>
            <Text style={styles.price}>{formatMoney(service.price)}</Text>
            <Text style={styles.duration}>{service.duration} мин</Text>
          </View>
          <TouchableOpacity
            style={styles.overflowButton}
            onPress={() => onMenuPress(service)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Действия с услугой"
          >
            <Ionicons name="ellipsis-horizontal" size={22} color="#666" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 52,
    marginBottom: 1,
    backgroundColor: '#fff',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    height: '100%',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  leftSection: {
    flex: 1,
    marginRight: 12,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  priceDurationContainer: {
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  duration: {
    fontSize: 12,
    color: '#666',
  },
  overflowButton: {
    padding: 4,
    marginLeft: 4,
  },
});
