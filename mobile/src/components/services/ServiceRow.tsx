import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, ActionSheetIOS } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MasterService } from '@src/services/api/master';
import { formatMoney } from '@src/utils/money';

interface ServiceRowProps {
  service: MasterService;
  onEdit: (service: MasterService) => void;
  onDelete: (serviceId: number) => void;
}

export function ServiceRow({ service, onEdit, onDelete }: ServiceRowProps) {
  const handleOverflowPress = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Отмена', 'Редактировать', 'Удалить'],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            onEdit(service);
          } else if (buttonIndex === 2) {
            Alert.alert(
              'Удаление услуги',
              'Вы уверены, что хотите удалить эту услугу?',
              [
                { text: 'Отмена', style: 'cancel' },
                {
                  text: 'Удалить',
                  style: 'destructive',
                  onPress: () => onDelete(service.id),
                },
              ]
            );
          }
        }
      );
    } else {
      Alert.alert(
        service.name,
        'Выберите действие',
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Редактировать',
            onPress: () => onEdit(service),
          },
          {
            text: 'Удалить',
            style: 'destructive',
            onPress: () => {
              Alert.alert(
                'Удаление услуги',
                'Вы уверены, что хотите удалить эту услугу?',
                [
                  { text: 'Отмена', style: 'cancel' },
                  {
                    text: 'Удалить',
                    style: 'destructive',
                    onPress: () => onDelete(service.id),
                  },
                ]
              );
            },
          },
        ],
        { cancelable: true }
      );
    }
  };

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
            onPress={handleOverflowPress}
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

