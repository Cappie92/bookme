import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@src/components/Card';
import { PrimaryButton } from '@src/components/PrimaryButton';
import { MasterClientPhonePickerField } from '@src/components/master/MasterClientPhonePickerField';
import { useModalKeyboardHeight } from '@src/hooks/useModalKeyboardHeight';
import { hasMaxDiscountAmountLimit } from '@src/utils/personalDiscountAmount';
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
  const keyboardHeight = useModalKeyboardHeight(showForm);
  const [form, setForm] = useState<PersonalDiscountForm>({
    client_phone: '',
    discount_percent: '',
    max_discount_amount: '',
    description: '',
  });

  const handleSubmit = async () => {
    if (!form.client_phone || !form.discount_percent) {
      Alert.alert('Ошибка', 'Укажите клиента и размер скидки');
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

      {showForm && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[
            styles.formKeyboardHost,
            Platform.OS === 'android' && keyboardHeight > 0
              ? { marginBottom: keyboardHeight }
              : null,
          ]}
        >
          <Card style={styles.formCard}>
            <Text style={styles.formTitle}>Добавить персональную скидку</Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              <View style={styles.form}>
                <MasterClientPhonePickerField
                  value={form.client_phone}
                  onChangeText={(text) => setForm({ ...form, client_phone: text })}
                />

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
                  <Text style={styles.label}>Максимальная сумма скидки, ₽</Text>
                  <TextInput
                    style={styles.input}
                    value={form.max_discount_amount}
                    onChangeText={(text) => setForm({ ...form, max_discount_amount: text })}
                    keyboardType="numeric"
                    placeholder="Пусто или 0 — без ограничения"
                  />
                  <Text style={styles.inputHint}>
                    Оставьте поле пустым или укажите 0 ₽, если не хотите ограничивать скидку по сумме.
                  </Text>
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
                      setForm({
                        client_phone: '',
                        discount_percent: '',
                        max_discount_amount: '',
                        description: '',
                      });
                    }}
                  >
                    <Text style={styles.cancelButtonText}>Отмена</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </Card>
        </KeyboardAvoidingView>
      )}

      {(() => {
        const activeList = discounts.filter((d) => d.is_active);
        return activeList.length > 0 ? (
          <ScrollView style={styles.discountsList} keyboardShouldPersistTaps="handled">
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
                      {hasMaxDiscountAmountLimit(discount.max_discount_amount)
                        ? ` (макс. ${discount.max_discount_amount} ₽)`
                        : ''}
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
  formKeyboardHost: {
    marginBottom: 8,
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
  inputHint: {
    fontSize: 12,
    color: '#888',
    marginTop: 6,
    lineHeight: 17,
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
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 48,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'center',
    includeFontPadding: false,
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
