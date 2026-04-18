import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@src/components/Card';
import { PrimaryButton } from '@src/components/PrimaryButton';
import type { LoyaltyDiscount } from '@src/types/loyalty_discounts';
import type { ComplexDiscountForm } from '@src/types/loyalty_discounts';
import { renderComplexConditions, getSupportedConditionTypesForUI, isConditionTypeSupported, normalizeConditionsForApi } from '@src/utils/loyaltyConditions';

interface DiscountsComplexTabProps {
  discounts: LoyaltyDiscount[];
  onCreateDiscount: (form: ComplexDiscountForm) => Promise<boolean>;
  onDeleteDiscount: (id: number) => Promise<void>;
  createDisabled?: boolean;
}

export function DiscountsComplexTab({
  discounts,
  onCreateDiscount,
  onDeleteDiscount,
  createDisabled = false,
}: DiscountsComplexTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ComplexDiscountForm>({
    name: '',
    description: '',
    discount_percent: '',
    conditions: [],
  });
  const [newCondition, setNewCondition] = useState({
    type: 'first_visit',  // Первый поддерживаемый тип по умолчанию
    operator: '>=',
    value: '',
    description: '',
  });

  const addCondition = () => {
    if (newCondition.value && newCondition.description) {
      setForm({
        ...form,
        conditions: [...form.conditions, { ...newCondition }],
      });
      setNewCondition({
        type: 'visits_count',
        operator: '>=',
        value: '',
        description: '',
      });
    } else {
      Alert.alert('Ошибка', 'Заполните значение и описание условия');
    }
  };

  const removeCondition = (index: number) => {
    setForm({
      ...form,
      conditions: form.conditions.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = async () => {
    if (!form.name || !form.description || !form.discount_percent || form.conditions.length === 0) {
      Alert.alert('Ошибка', 'Заполните все обязательные поля');
      return;
    }

    // Валидация: проверяем, что все condition_type поддерживаются
    for (const condition of form.conditions) {
      const normalized = normalizeConditionsForApi([condition]);
      if (normalized.condition_type && !isConditionTypeSupported(normalized.condition_type)) {
        Alert.alert(
          'Ошибка',
          `Неподдерживаемый тип условия: ${normalized.condition_type}. ` +
          `Поддерживаемые типы: первая запись, возвращение клиента, регулярные визиты, счастливые часы, скидка на услуги`
        );
        return;
      }
    }

    // Логирование для отладки
    if (__DEV__) {
      const normalized = normalizeConditionsForApi(form.conditions);
      console.log('[DiscountsComplexTab] Creating complex discount:', {
        condition_type: normalized.condition_type,
        parameters: normalized.parameters,
        discount_name: form.name,
      });
    }

    // Нормализация conditions выполняется в API слое (loyalty_discounts.ts)
    // Передаём form как есть
    const success = await onCreateDiscount(form);
    if (success) {
      setShowForm(false);
      setForm({
        name: '',
        description: '',
        discount_percent: '',
        conditions: [],
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
        <Text style={styles.title}>Сложные скидки</Text>
        <Text style={styles.description}>
          Настройка скидок с несколькими условиями
        </Text>
      </View>

      {/* Форма создания */}
      {showForm ? (
        <Card style={styles.formCard}>
          <Text style={styles.formTitle}>Создать сложную скидку</Text>
          
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Название скидки *</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={(text) => setForm({ ...form, name: text })}
                placeholder="Например: VIP клиенты"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Описание *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={form.description}
                onChangeText={(text) => setForm({ ...form, description: text })}
                placeholder="Описание условий скидки"
                multiline
                numberOfLines={3}
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
                  placeholder="10"
                  maxLength={5}
                />
                <Text style={styles.percentSymbol}>%</Text>
              </View>
            </View>

            {/* Условия */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Условия скидки *</Text>
              
              {/* Список существующих условий */}
              {form.conditions.length > 0 && (
                <View style={styles.conditionsList}>
                  {form.conditions.map((condition, index) => (
                    <View key={index} style={styles.conditionItem}>
                      <Text style={styles.conditionText} numberOfLines={1}>
                        {condition.description}
                      </Text>
                      <TouchableOpacity
                        style={styles.removeConditionButton}
                        onPress={() => removeCondition(index)}
                      >
                        <Ionicons name="trash-outline" size={18} color="#d32f2f" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Добавление нового условия */}
              <Card style={styles.newConditionCard}>
                <View style={styles.newConditionRow}>
                  <View style={styles.conditionSelect}>
                    <Text style={styles.conditionSelectLabel}>Тип</Text>
                    <ScrollView style={styles.selectContainer}>
                      {getSupportedConditionTypesForUI().map((type) => (
                        <TouchableOpacity
                          key={type.uiType}
                          style={styles.selectOption}
                          onPress={() => setNewCondition({ ...newCondition, type: type.uiType })}
                        >
                          <Text style={newCondition.type === type.uiType ? styles.selectOptionSelected : styles.selectOptionText}>
                            {type.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  <View style={styles.conditionSelect}>
                    <Text style={styles.conditionSelectLabel}>Оператор</Text>
                    <ScrollView style={styles.selectContainer}>
                      {['>=', '>', '=', '<', '<='].map((op) => (
                        <TouchableOpacity
                          key={op}
                          style={styles.selectOption}
                          onPress={() => setNewCondition({ ...newCondition, operator: op })}
                        >
                          <Text style={newCondition.operator === op ? styles.selectOptionSelected : styles.selectOptionText}>
                            {op === '>=' ? '≥' : op === '>' ? '>' : op === '=' ? '=' : op === '<' ? '<' : '≤'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>

                <View style={styles.conditionInputs}>
                  <TextInput
                    style={styles.conditionValueInput}
                    value={newCondition.value}
                    onChangeText={(text) => setNewCondition({ ...newCondition, value: text })}
                    keyboardType="numeric"
                    placeholder="Значение"
                  />
                  <TouchableOpacity
                    style={styles.addConditionButton}
                    onPress={addCondition}
                  >
                    <Text style={styles.addConditionButtonText}>Добавить</Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={[styles.input, styles.conditionDescriptionInput]}
                  value={newCondition.description}
                  onChangeText={(text) => setNewCondition({ ...newCondition, description: text })}
                  placeholder="Описание условия (например: 'Более 5 визитов')"
                />
              </Card>
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
                  setForm({ name: '', description: '', discount_percent: '', conditions: [] });
                }}
              >
                <Text style={styles.cancelButtonText}>Отмена</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Card>
      ) : (
        <PrimaryButton
          title="Создать сложную скидку"
          onPress={() => setShowForm(true)}
          disabled={createDisabled}
          icon={<Ionicons name="add" size={22} color="#fff" />}
        />
      )}

      {/* Список активных скидок (только is_active) */}
      {(() => {
        const activeList = discounts.filter((d) => d.is_active);
        return activeList.length > 0 && (
        <View style={styles.activeDiscountsSection}>
          <Text style={styles.sectionTitle}>Активные сложные скидки</Text>
          <View style={styles.discountsList}>
            {activeList.map((discount) => {
              // Парсим conditions (может быть массив или dict)
              const conditionsList = Array.isArray(discount.conditions)
                ? discount.conditions
                : discount.conditions?.conditions
                ? [discount.conditions]
                : [];

              return (
                <Card key={discount.id} style={styles.discountCard}>
                  <View style={styles.discountHeader}>
                    <View style={styles.discountInfo}>
                      <Text style={styles.discountName}>{discount.name}</Text>
                      {discount.description && (
                        <Text style={styles.discountDescription}>{discount.description}</Text>
                      )}
                      <Text style={styles.discountPercent}>
                        Скидка: {discount.discount_percent}%
                      </Text>
                      
                      {conditionsList.length > 0 && (
                        <View style={styles.conditionsContainer}>
                          <Text style={styles.conditionsLabel}>Условия:</Text>
                          {conditionsList.map((cond: any, index: number) => (
                            <View key={index} style={styles.conditionBadge}>
                              <Text style={styles.conditionBadgeText}>
                                {cond.description || renderComplexConditions([cond])[0]}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDelete(discount.id)}
                    >
                      <Ionicons name="trash-outline" size={22} color="#d32f2f" />
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            })}
          </View>
        </View>
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
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
  conditionsList: {
    gap: 8,
    marginBottom: 12,
  },
  conditionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
  },
  conditionText: {
    flex: 1,
    fontSize: 12,
    color: '#666',
  },
  removeConditionButton: {
    padding: 4,
  },
  newConditionCard: {
    padding: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  newConditionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  conditionSelect: {
    flex: 1,
  },
  conditionSelectLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  selectContainer: {
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  selectOption: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  selectOptionText: {
    fontSize: 12,
    color: '#333',
  },
  selectOptionSelected: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  conditionInputs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  conditionValueInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 8,
    fontSize: 12,
    backgroundColor: '#fff',
  },
  addConditionButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
  },
  addConditionButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  conditionDescriptionInput: {
    marginTop: 8,
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
  activeDiscountsSection: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  discountsList: {
    gap: 12,
  },
  discountCard: {
    padding: 16,
  },
  discountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  discountInfo: {
    flex: 1,
    marginRight: 12,
  },
  discountName: {
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
    marginBottom: 8,
  },
  conditionsContainer: {
    marginTop: 8,
  },
  conditionsLabel: {
    fontSize: 10,
    color: '#999',
    marginBottom: 4,
  },
  conditionBadge: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 4,
  },
  conditionBadgeText: {
    fontSize: 10,
    color: '#666',
  },
  deleteButton: {
    padding: 8,
  },
});
