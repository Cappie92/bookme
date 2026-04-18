import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@src/components/ScreenContainer';
import { Card } from '@src/components/Card';
import { PrimaryButton } from '@src/components/PrimaryButton';
import { SecondaryButton } from '@src/components/SecondaryButton';
import {
  getMasterServices,
  getMasterServiceCategories,
  createMasterService,
  updateMasterService,
  deleteMasterService,
  createMasterServiceCategory,
  updateMasterServiceCategory,
  deleteMasterServiceCategory,
  MasterService,
  MasterServiceCategory,
} from '@src/services/api/master';
import { formatMoney } from '@src/utils/money';
import { FeatureLock } from '@src/components/FeatureLock';
import { CategoryAccordion } from '@src/components/services/CategoryAccordion';
import { ServiceRow } from '@src/components/services/ServiceRow';
import { DurationPickerModal } from '@src/components/modals/DurationPickerModal';

export default function MasterServicesScreen() {
  const [services, setServices] = useState<MasterService[]>([]);
  const [categories, setCategories] = useState<MasterServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  
  // Модальные окна
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [editingService, setEditingService] = useState<MasterService | null>(null);
  const [editingCategory, setEditingCategory] = useState<MasterServiceCategory | null>(null);
  
  // Форма услуги
  const [serviceForm, setServiceForm] = useState({
    name: '',
    description: '',
    duration: 30,
    price: '',
    category_id: null as number | null,
  });
  
  // Форма категории
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
  });
  
  // Новая категория для создания прямо в модалке услуги
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  
  const [saving, setSaving] = useState(false);
  
  // State для раскрытых категорий (по умолчанию все раскрыты)
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  
  const toggleCategory = (categoryId: number) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const expandAllCategories = () => {
    const allCategoryIds = new Set(categories.map(cat => cat.id));
    const uncategorizedServices = services.filter(s => !s.category_id);
    if (uncategorizedServices.length > 0) {
      allCategoryIds.add(0);
    }
    setExpandedCategories(allCategoryIds);
  };

  const collapseAllCategories = () => {
    setExpandedCategories(new Set());
  };

  const loadData = async () => {
    try {
      setError(null);
      const [servicesData, categoriesData] = await Promise.all([
        getMasterServices(),
        getMasterServiceCategories(),
      ]);
      setServices(servicesData);
      setCategories(categoriesData);
      
      // После загрузки данных обновляем состояние раскрытия категорий
      // Новые категории будут раскрыты, удаленные - убраны из состояния
      setExpandedCategories(prev => {
        const next = new Set(prev);
        const currentCategoryIds = new Set(categoriesData.map(cat => cat.id));
        const uncategorizedServices = servicesData.filter(s => !s.category_id);
        if (uncategorizedServices.length > 0) {
          currentCategoryIds.add(0);
        }
        
        // Если это первая загрузка (prev пустой), раскрываем все категории
        if (prev.size === 0) {
          return currentCategoryIds;
        }
        
        // Убираем удаленные категории
        prev.forEach(id => {
          if (!currentCategoryIds.has(id)) {
            next.delete(id);
          }
        });
        
        // Добавляем новые категории (раскрытыми)
        currentCategoryIds.forEach(id => {
          if (!next.has(id)) {
            next.add(id);
          }
        });
        
        return next;
      });
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки данных');
      console.error('Error loading services:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCreateService = async () => {
    setEditingService(null);
    setServiceForm({
      name: '',
      description: '',
      duration: 30,
      price: '',
      category_id: null,
    });
    setNewCategoryName('');
    // Загружаем категории при открытии модалки
    try {
      const categoriesData = await getMasterServiceCategories();
      setCategories(categoriesData);
    } catch (err) {
      console.error('Error loading categories:', err);
    }
    setShowServiceModal(true);
  };

  const handleEditService = async (service: MasterService) => {
    setEditingService(service);
    setServiceForm({
      name: service.name,
      description: service.description || '',
      duration: service.duration,
      price: String(service.price),
      category_id: service.category_id,
    });
    setNewCategoryName('');
    // Загружаем категории при открытии модалки
    try {
      const categoriesData = await getMasterServiceCategories();
      setCategories(categoriesData);
    } catch (err) {
      console.error('Error loading categories:', err);
    }
    setShowServiceModal(true);
  };

  const handleCreateCategoryInServiceModal = async () => {
    if (!newCategoryName.trim()) {
      Alert.alert(
        'Ошибка',
        'Введите название категории',
        [{ text: 'Понятно', style: 'default' }]
      );
      return;
    }

    setCreatingCategory(true);
    try {
      const newCategory = await createMasterServiceCategory({
        name: newCategoryName.trim(),
        description: '',
      });
      // Обновляем список категорий
      const updatedCategories = await getMasterServiceCategories();
      setCategories(updatedCategories);
      // Автоматически выбираем созданную категорию
      setServiceForm({ ...serviceForm, category_id: newCategory.id });
      setNewCategoryName('');
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Не удалось создать категорию';
      let displayMessage = errorMessage;
      
      // Улучшаем сообщения об ошибках
      if (errorMessage.includes('уже существует') || errorMessage.includes('already exists')) {
        displayMessage = `Категория "${newCategoryName.trim()}" уже существует. Выберите её из списка или введите другое название.`;
      }
      
      Alert.alert(
        'Ошибка создания категории',
        displayMessage,
        [{ text: 'Понятно', style: 'default' }]
      );
    } finally {
      setCreatingCategory(false);
    }
  };

  const handleSaveService = async () => {
    if (!serviceForm.name.trim() || !serviceForm.duration || !serviceForm.price) {
      Alert.alert(
        'Не заполнены обязательные поля',
        'Пожалуйста, заполните все поля, отмеченные звёздочкой (*)',
        [{ text: 'Понятно', style: 'default' }]
      );
      return;
    }

    if (!serviceForm.category_id) {
      Alert.alert(
        'Не выбрана категория',
        'Пожалуйста, выберите категорию для услуги или создайте новую',
        [{ text: 'Понятно', style: 'default' }]
      );
      return;
    }

    setSaving(true);
    try {
      const serviceData = {
        name: serviceForm.name.trim(),
        description: serviceForm.description.trim() || undefined,
        duration: serviceForm.duration,
        price: parseFloat(serviceForm.price),
        category_id: serviceForm.category_id,
      };

      if (editingService) {
        await updateMasterService(editingService.id, serviceData);
      } else {
        await createMasterService(serviceData);
      }

                  setShowServiceModal(false);
                  setEditingService(null);
                  setNewCategoryName('');
                  setShowCategoryDropdown(false);
                  setShowDurationPicker(false);
                  loadData();
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Не удалось сохранить услугу';
      let displayMessage = errorMessage;
      
      // Улучшаем сообщения об ошибках
      if (errorMessage.includes('уже существует') || errorMessage.includes('already exists')) {
        displayMessage = `Услуга с названием "${serviceForm.name.trim()}" уже существует. Пожалуйста, выберите другое название.`;
      } else if (errorMessage.includes('Invalid category')) {
        displayMessage = 'Выбранная категория не найдена. Пожалуйста, выберите другую категорию.';
      } else if (errorMessage.includes('int_type') || errorMessage.includes('valid integer')) {
        displayMessage = 'Ошибка в данных. Пожалуйста, проверьте правильность введённых значений.';
      }
      
      Alert.alert(
        'Ошибка сохранения услуги',
        displayMessage,
        [{ text: 'Понятно', style: 'default' }]
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteService = (serviceId: number) => {
    Alert.alert(
      'Удаление услуги',
      'Вы уверены, что хотите удалить эту услугу?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMasterService(serviceId);
              loadData();
            } catch (err: any) {
              Alert.alert('Ошибка', err.message || 'Не удалось удалить услугу');
            }
          },
        },
      ]
    );
  };

  const handleCreateCategory = () => {
    setEditingCategory(null);
    setCategoryForm({ name: '', description: '' });
    setShowCategoryModal(true);
  };

  const handleEditCategory = (category: MasterServiceCategory) => {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      description: category.description || '',
    });
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) {
      Alert.alert(
        'Не заполнено обязательное поле',
        'Пожалуйста, введите название категории',
        [{ text: 'Понятно', style: 'default' }]
      );
      return;
    }

    setSaving(true);
    try {
      const categoryData = {
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim() || undefined,
      };

      if (editingCategory) {
        await updateMasterServiceCategory(editingCategory.id, categoryData);
      } else {
        await createMasterServiceCategory(categoryData);
      }

      setShowCategoryModal(false);
      setEditingCategory(null);
      // Перезагружаем категории и услуги
      await loadData();
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Не удалось сохранить категорию';
      let displayMessage = errorMessage;
      
      // Улучшаем сообщения об ошибках
      if (errorMessage.includes('уже существует') || errorMessage.includes('already exists')) {
        displayMessage = `Категория "${categoryForm.name.trim()}" уже существует. Пожалуйста, выберите другое название.`;
      }
      
      Alert.alert(
        'Ошибка сохранения категории',
        displayMessage,
        [{ text: 'Понятно', style: 'default' }]
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = (categoryId: number) => {
    Alert.alert(
      'Удаление категории',
      'Все услуги в этой категории будут перемещены в "Без категории". Продолжить?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMasterServiceCategory(categoryId);
              loadData();
            } catch (err: any) {
              Alert.alert('Ошибка', err.message || 'Не удалось удалить категорию');
            }
          },
        },
      ]
    );
  };

  const getServicesByCategory = (categoryId: number | null) => {
    return services.filter(s => (s.category_id === categoryId) || (categoryId === null && !s.category_id));
  };

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Загрузка...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable>
      <View style={styles.header}>
        <Text style={styles.title}>Мои услуги</Text>
        <View style={styles.actions}>
          <FeatureLock feature="has_booking_page">
            <TouchableOpacity onPress={handleCreateService} style={[styles.actionButton, styles.primaryAction]}>
              <Text style={[styles.actionButtonText, styles.primaryActionText]}>+ Услуга</Text>
            </TouchableOpacity>
          </FeatureLock>
          <FeatureLock feature="has_booking_page">
            <TouchableOpacity onPress={handleCreateCategory} style={[styles.actionButton, styles.secondaryAction]}>
              <Text style={[styles.actionButtonText, styles.secondaryActionText]}>+ Категория</Text>
            </TouchableOpacity>
          </FeatureLock>
        </View>
        <View style={styles.expandControls}>
          <TouchableOpacity onPress={expandAllCategories} style={styles.expandButton}>
            <Text style={styles.expandButtonText}>Развернуть все</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={collapseAllCategories} style={styles.expandButton}>
            <Text style={styles.expandButtonText}>Свернуть все</Text>
          </TouchableOpacity>
        </View>
      </View>

      {error && (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      )}

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={styles.content}
      >
        {/* Услуги без категории */}
        {getServicesByCategory(null).length > 0 && (
          <CategoryAccordion
            category={{ id: 0, name: 'Без категории', description: null }}
            services={getServicesByCategory(null)}
            isExpanded={expandedCategories.has(0)}
            onToggle={() => toggleCategory(0)}
            onEditCategory={() => {}}
            onDeleteCategory={() => {}}
            renderService={(service) => (
              <ServiceRow
                service={service}
                onEdit={handleEditService}
                onDelete={handleDeleteService}
              />
            )}
            onCreateService={handleCreateService}
          />
        )}

        {/* Категории с услугами */}
        {categories.map(category => {
          const categoryServices = getServicesByCategory(category.id);
          return (
            <CategoryAccordion
              key={category.id}
              category={category}
              services={categoryServices}
              isExpanded={expandedCategories.has(category.id)}
              onToggle={() => toggleCategory(category.id)}
              onEditCategory={handleEditCategory}
              onDeleteCategory={handleDeleteCategory}
              renderService={(service) => (
                <ServiceRow
                  service={service}
                  onEdit={handleEditService}
                  onDelete={handleDeleteService}
                />
              )}
              onCreateService={handleCreateService}
            />
          );
        })}

        {services.length === 0 && categories.length === 0 && (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>У вас пока нет услуг</Text>
            <Text style={styles.emptySubtext}>Создайте первую услугу</Text>
          </Card>
        )}
      </ScrollView>

      {/* Модальное окно услуги */}
      <Modal 
        visible={showServiceModal} 
        animationType="slide" 
        transparent
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingService ? 'Редактировать услугу' : 'Создать услугу'}
            </Text>
            <ScrollView
              onScrollBeginDrag={() => {
                setShowCategoryDropdown(false);
                setShowDurationPicker(false);
              }}
              scrollEventThrottle={16}
            >
              <TextInput
                style={styles.input}
                placeholder="Название услуги *"
                value={serviceForm.name}
                onChangeText={(text) => setServiceForm({ ...serviceForm, name: text })}
              />
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Описание"
                value={serviceForm.description}
                onChangeText={(text) => setServiceForm({ ...serviceForm, description: text })}
                multiline
                numberOfLines={3}
              />
              
              {/* Категория */}
              <View style={styles.categorySection}>
                <Text style={styles.label}>Категория *</Text>
                <View style={styles.dropdownContainer}>
                  <TouchableOpacity
                    style={[styles.selectButton, !serviceForm.category_id && styles.selectButtonEmpty]}
                    onPress={() => {
                      setShowCategoryDropdown(!showCategoryDropdown);
                      setShowDurationPicker(false);
                    }}
                  >
                    <Text style={[styles.selectButtonText, !serviceForm.category_id && styles.selectButtonTextEmpty]}>
                      {serviceForm.category_id
                        ? categories.find(c => c.id === serviceForm.category_id)?.name || 'Выберите категорию'
                        : 'Выберите категорию'}
                    </Text>
                    <Ionicons
                      name={showCategoryDropdown ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color="#666"
                      style={styles.dropdownArrow}
                    />
                  </TouchableOpacity>
                  {showCategoryDropdown && (
                    <View style={styles.dropdownList}>
                      <ScrollView style={styles.dropdownScrollView} nestedScrollEnabled>
                        {categories.length === 0 ? (
                          <View style={styles.dropdownEmptyItem}>
                            <Text style={styles.dropdownEmptyText}>Категорий пока нет</Text>
                          </View>
                        ) : (
                          categories.map(cat => (
                            <TouchableOpacity
                              key={cat.id}
                              style={[
                                styles.dropdownItem,
                                serviceForm.category_id === cat.id && styles.dropdownItemSelected,
                              ]}
                              onPress={() => {
                                setServiceForm({ ...serviceForm, category_id: cat.id });
                                setShowCategoryDropdown(false);
                              }}
                            >
                              <Text style={[
                                styles.dropdownItemText,
                                serviceForm.category_id === cat.id && styles.dropdownItemTextSelected,
                              ]}>
                                {cat.name}
                              </Text>
                            </TouchableOpacity>
                          ))
                        )}
                      </ScrollView>
                    </View>
                  )}
                </View>
                <View style={styles.newCategoryRow}>
                  <TextInput
                    style={[styles.input, styles.newCategoryInput]}
                    placeholder="Новая категория"
                    value={newCategoryName}
                    onChangeText={setNewCategoryName}
                  />
                  <TouchableOpacity
                    style={[styles.addCategoryButton, (!newCategoryName.trim() || creatingCategory) && styles.addCategoryButtonDisabled]}
                    onPress={handleCreateCategoryInServiceModal}
                    disabled={!newCategoryName.trim() || creatingCategory}
                  >
                    <Text style={styles.addCategoryButtonText}>
                      {creatingCategory ? '...' : '+'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Длительность - модальный выбор */}
              <View style={styles.durationSection}>
                <Text style={styles.label}>Длительность *</Text>
                <TouchableOpacity
                  style={[styles.durationInput, !serviceForm.duration && styles.durationInputEmpty]}
                  onPress={() => {
                    if (__DEV__) console.log('[DURATION] press');
                    setShowDurationPicker(true);
                    setShowCategoryDropdown(false);
                    if (__DEV__) console.log('[DURATION] open - setShowDurationPicker(true)');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.durationInputText, !serviceForm.duration && styles.durationInputTextEmpty]}>
                    {serviceForm.duration
                      ? (() => {
                          const hours = Math.floor(serviceForm.duration / 60);
                          const mins = serviceForm.duration % 60;
                          return hours > 0
                            ? `${hours}ч${mins > 0 ? ` ${mins}мин` : ''}`
                            : `${mins}мин`;
                        })()
                      : 'Выберите длительность'}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color="#666" style={styles.durationInputArrow} />
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.input}
                placeholder="Цена (руб) *"
                value={serviceForm.price}
                onChangeText={(text) => setServiceForm({ ...serviceForm, price: text })}
                keyboardType="numeric"
              />
            </ScrollView>
            <View style={styles.modalActions}>
              <SecondaryButton
                title="Отмена"
                onPress={() => {
                  setShowServiceModal(false);
                  setEditingService(null);
                  setNewCategoryName('');
                  setShowCategoryDropdown(false);
                  setShowDurationPicker(false);
                }}
                style={styles.modalButton}
              />
              <PrimaryButton
                title="Сохранить"
                onPress={handleSaveService}
                loading={saving}
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
        
        {/* Модальное окно выбора длительности - поверх модалки услуги */}
        {showDurationPicker && (
          <View style={styles.durationPickerOverlay}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => {
                if (__DEV__) console.log('[DURATION] close from overlay');
                setShowDurationPicker(false);
              }}
            />
            <View style={styles.durationPickerContent}>
              <View style={styles.durationPickerHeader}>
                <Text style={styles.durationPickerTitle}>Выберите длительность</Text>
                <TouchableOpacity
                  onPress={() => {
                    if (__DEV__) console.log('[DURATION] close from button');
                    setShowDurationPicker(false);
                  }}
                  style={styles.durationPickerCloseButton}
                >
                  <Text style={styles.durationPickerCloseText}>Отмена</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.durationPickerList}
                contentContainerStyle={styles.durationPickerListContent}
                showsVerticalScrollIndicator={true}
              >
                {(() => {
                  const durationOptions = [];
                  for (let minutes = 10; minutes <= 480; minutes += 10) {
                    const hours = Math.floor(minutes / 60);
                    const mins = minutes % 60;
                    const displayText = hours > 0
                      ? `${hours}ч${mins > 0 ? ` ${mins}мин` : ''}`
                      : `${mins}мин`;
                    durationOptions.push({ value: minutes, label: displayText });
                  }
                  return durationOptions.map(option => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.durationPickerOption,
                        serviceForm.duration === option.value && styles.durationPickerOptionSelected,
                      ]}
                      onPress={() => {
                        if (__DEV__) console.log('[DURATION] select', option.value);
                        setServiceForm({ ...serviceForm, duration: option.value });
                        setShowDurationPicker(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.durationPickerOptionText,
                          serviceForm.duration === option.value && styles.durationPickerOptionTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                      {serviceForm.duration === option.value && (
                        <Ionicons name="checkmark" size={20} color="#4CAF50" />
                      )}
                    </TouchableOpacity>
                  ));
                })()}
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>

      {/* Модальное окно категории */}
      <Modal visible={showCategoryModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingCategory ? 'Редактировать категорию' : 'Создать категорию'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Название категории *"
              value={categoryForm.name}
              onChangeText={(text) => setCategoryForm({ ...categoryForm, name: text })}
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Описание"
              value={categoryForm.description}
              onChangeText={(text) => setCategoryForm({ ...categoryForm, description: text })}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalActions}>
              <SecondaryButton
                title="Отмена"
                onPress={() => {
                  setShowCategoryModal(false);
                  setEditingCategory(null);
                }}
                style={styles.modalButton}
              />
              <PrimaryButton
                title="Сохранить"
                onPress={handleSaveCategory}
                loading={saving}
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    marginLeft: -16,
    marginRight: -16,
    marginTop: -16,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  expandControls: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  expandButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  expandButtonText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '500',
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  secondaryAction: {
    borderColor: '#D0D5DD',
    backgroundColor: '#fff',
  },
  primaryAction: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  primaryActionText: {
    color: '#fff',
  },
  secondaryActionText: {
    color: '#344054',
  },
  errorCard: {
    backgroundColor: '#FFEBEE',
    margin: 16,
  },
  errorText: {
    color: '#F44336',
    fontSize: 14,
  },
  content: {
    padding: 16,
  },
  categoryCard: {
    marginBottom: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  categoryHeaderInfo: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  categoryCount: {
    fontSize: 12,
    color: '#666',
  },
  categoryActions: {
    flexDirection: 'row',
    gap: 12,
  },
  serviceItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  serviceInfo: {
    marginBottom: 8,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  serviceDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  serviceDetails: {
    flexDirection: 'row',
    gap: 16,
  },
  serviceDetail: {
    fontSize: 14,
    color: '#666',
  },
  serviceActions: {
    flexDirection: 'row',
    gap: 16,
  },
  editButton: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  deleteButton: {
    fontSize: 14,
    color: '#F44336',
    fontWeight: '600',
  },
  emptyCard: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  categorySection: {
    marginBottom: 16,
  },
  categoryRow: {
    marginBottom: 8,
  },
  newCategoryRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  newCategoryInput: {
    flex: 1,
    marginBottom: 0,
  },
  addCategoryButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addCategoryButtonDisabled: {
    backgroundColor: '#ccc',
  },
  addCategoryButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  durationSection: {
    marginBottom: 16,
  },
  durationInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
    minHeight: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  durationInputEmpty: {
    borderColor: '#999',
  },
  durationInputText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  durationInputTextEmpty: {
    color: '#999',
  },
  durationInputArrow: {
    marginLeft: 8,
  },
  durationPickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    justifyContent: 'flex-end',
  },
  durationPickerContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 20,
  },
  durationPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  durationPickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  durationPickerCloseButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  durationPickerCloseText: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: '500',
  },
  durationPickerList: {
    maxHeight: 400,
  },
  durationPickerListContent: {
    paddingVertical: 8,
  },
  durationPickerOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  durationPickerOptionSelected: {
    backgroundColor: '#E8F5E9',
  },
  durationPickerOptionText: {
    fontSize: 16,
    color: '#333',
  },
  durationPickerOptionTextSelected: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  dropdownContainer: {
    position: 'relative',
    zIndex: 10,
    marginBottom: 16,
  },
  selectButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
    minHeight: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectButtonEmpty: {
    borderColor: '#999',
  },
  selectButtonText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  selectButtonTextEmpty: {
    color: '#999',
  },
  dropdownArrow: {
    marginLeft: 8,
  },
  dropdownList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    maxHeight: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
  },
  dropdownScrollView: {
    maxHeight: 200,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  dropdownItemSelected: {
    backgroundColor: '#E8F5E9',
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#333',
  },
  dropdownItemTextSelected: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  dropdownEmptyItem: {
    padding: 16,
    alignItems: 'center',
  },
  dropdownEmptyText: {
    fontSize: 14,
    color: '#999',
  },
  pickerList: {
    maxHeight: 300,
  },
  pickerItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  pickerItemSelected: {
    backgroundColor: '#E8F5E9',
  },
  pickerItemText: {
    fontSize: 16,
    color: '#333',
  },
  pickerItemTextSelected: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  emptyCategoryText: {
    padding: 16,
    alignItems: 'center',
  },
  emptyCategoryTextContent: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  emptyPickerContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyPickerText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
    fontWeight: '600',
  },
  emptyPickerSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});

