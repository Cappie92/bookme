import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@src/components/Card';
import { PrimaryButton } from '@src/components/PrimaryButton';
import type { PersonalDiscount } from '@src/types/loyalty_discounts';
import type { PersonalDiscountForm } from '@src/types/loyalty_discounts';

interface DiscountsPersonalTabProps {
  discounts: PersonalDiscount[];
  onCreateDiscount: (form: PersonalDiscountForm) => Promise<boolean>;
  onDeleteDiscount: (id: number) => Promise<void>;
  createDisabled?: boolean;
}

export function DiscountsPersonalTab({
  discounts,
  onCreateDiscount,
  onDeleteDiscount,
  createDisabled = false,
}: DiscountsPersonalTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PersonalDiscountForm>({
    client_phone: '',
    discount_percent: '',
    max_discount_amount: '',
    description: '',
  });

  const handleSubmit = async () => {
    if (!form.client_phone || !form.discount_percent) {
      Alert.alert('Ошибка', 'Заполните номер телефона и размер скидки');
      return;
    }

    const percent = parseFloat(form.discount_percent);
    if (isNaN(percent) || percent < 0 || percent > 100) {
      Alert.alert('Ошибка', 'Процент должен быть от 0 до 100');
      return;
    }

    const success = await onCreateDiscount(form);
    if (success) {
      setShowForm(false);
      setForm({
        client_phone: '',
        discount_percent: '',
        max_discount_amount: '',
        description: '',
      });
    }
  };

  const handleDelete = (discountId: number) => {
    Alert.alert(
      'Подтверждение',
      'Вы уверены, что хотите удалить эту скидку?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => onDeleteDiscount(discountId),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Персональные скидки</Text>
          <Text style={styles.description}>
            Скидки для конкретных клиентов по номеру телефона
          </Text>
        </View>
        {!showForm && (
          <PrimaryButton
            title="Добавить пользователя"
            onPress={() => setShowForm(true)}
            disabled={createDisabled}
            icon={<Ionicons name="add" size={18} color="#fff" />}
            style={styles.addUserButton}
            textStyle={styles.addUserButtonText}
          />
        )}
      </View>

      {/* Форма создания */}
      {showForm && (
        <Card style={styles.formCard}>
          <Text style={styles.formTitle}>Добавить персональную скидку</Text>
          
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Номер телефона клиента *</Text>
              <TextInput
                style={styles.input}
                value={form.client_phone}
                onChangeText={(text) => setForm({ ...form, client_phone: text })}
                placeholder="+7 (999) 123-45-67"
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Размер скидки (%) *</Text>
              <View style={styles.percentInputContainer}>
                <TextInput
                  style={styles.percentInput}
                  value={form.discount_percent}
                  onChangeText={(text) => setForm({ ...form, discount_percent: text })}
                  keyboardType="numeric"
                  placeholder="0"
                  maxLength={5}
                />
                <Text style={styles.percentSymbol}>%</Text>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Максимальная сумма скидки (руб.)</Text>
              <TextInput
                style={styles.input}
                value={form.max_discount_amount}
                onChangeText={(text) => setForm({ ...form, max_discount_amount: text })}
                keyboardType="numeric"
                placeholder="Оставьте пустым для неограниченной скидки"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Описание</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={form.description}
                onChangeText={(text) => setForm({ ...form, description: text })}
                placeholder="Описание скидки (необязательно)"
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.formActions}>
              <PrimaryButton
                title="Создать скидку"
                onPress={handleSubmit}
                style={styles.submitButton}
              />
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowForm(false);
                  setForm({ client_phone: '', discount_percent: '', max_discount_amount: '', description: '' });
                }}
              >
                <Text style={styles.cancelButtonText}>Отмена</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Card>
      )}

      {/* Список персональных скидок (только is_active) */}
      {(() => {
        const activeList = discounts.filter((d) => d.is_active);
        return activeList.length > 0 ? (
        <ScrollView style={styles.discountsList}>
          {activeList.map((discount) => (
            <Card key={discount.id} style={styles.discountCard}>
              <View style={styles.discountContent}>
                <View style={styles.discountInfo}>
                  <Text style={styles.discountPhone}>{discount.client_phone}</Text>
                  {discount.description && (
                    <Text style={styles.discountDescription}>{discount.description}</Text>
                  )}
                  <Text style={styles.discountPercent}>
                    Скидка: {discount.discount_percent}%
                    {discount.max_discount_amount && ` (макс. ${discount.max_discount_amount} руб.)`}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDelete(discount.id)}
                >
                  <Ionicons name="trash-outline" size={22} color="#d32f2f" />
                </TouchableOpacity>
              </View>
            </Card>
          ))}
        </ScrollView>
        ) : (
        !showForm && (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>Персональные скидки не настроены</Text>
          </Card>
        )
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * Горизонтальный padding даёт родитель (`loyalty.tsx` → `styles.content`, padding 16).
   * Двойные 16+16 давали «рыхлый» край относительно mobile web — здесь только вертикаль.
   */
  container: {
    paddingVertical: 12,
    paddingHorizontal: 0,
  },
  header: {
    marginBottom: 20,
  },
  headerContent: {
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#666',
  },
  addUserButton: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 18,
    minHeight: 44,
    borderRadius: 8,
  },
  addUserButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  formCard: {
    padding: 16,
    marginBottom: 24,
    backgroundColor: '#F9F9F9',
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#fff',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  percentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingRight: 12,
    backgroundColor: '#fff',
  },
  percentInput: {
    flex: 1,
    padding: 12,
    fontSize: 14,
  },
  percentSymbol: {
    fontSize: 14,
    color: '#666',
    marginLeft: 4,
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  submitButton: {
    flex: 1,
  },
  cancelButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  discountsList: {
    gap: 12,
  },
  discountCard: {
    padding: 16,
    marginBottom: 12,
  },
  discountContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  discountInfo: {
    flex: 1,
    marginRight: 12,
  },
  discountPhone: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  discountDescription: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  discountPercent: {
    fontSize: 12,
    color: '#4CAF50',
  },
  deleteButton: {
    padding: 8,
  },
  emptyCard: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});
