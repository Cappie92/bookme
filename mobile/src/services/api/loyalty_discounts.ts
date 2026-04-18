import { apiClient } from './client';
import type {
  LoyaltyDiscount,
  PersonalDiscount,
  LoyaltySystemStatus,
  QuickDiscountTemplate,
  LoyaltyDiscountCreate,
  LoyaltyDiscountUpdate,
  PersonalDiscountCreate,
  PersonalDiscountUpdate,
  LoyaltyDiscountType,
} from '@src/types/loyalty_discounts';

// Re-export типы для обратной совместимости
export type {
  LoyaltyDiscount,
  PersonalDiscount,
  LoyaltySystemStatus,
  QuickDiscountTemplate,
  LoyaltyDiscountCreate,
  LoyaltyDiscountUpdate,
  PersonalDiscountCreate,
  PersonalDiscountUpdate,
};

export { LoyaltyDiscountType } from '@src/types/loyalty_discounts';
export { LoyaltyConditionType } from '@src/types/loyalty_discounts';

// ============================================================================
// ТИПЫ ДАННЫХ (legacy - для обратной совместимости, будут удалены)
// ============================================================================

// Типы импортированы из @src/types/loyalty_discounts.ts

// ============================================================================
// API ФУНКЦИИ
// ============================================================================

/**
 * Получить шаблоны быстрых скидок
 * GET /api/loyalty/templates
 */
export async function getLoyaltyTemplates(): Promise<QuickDiscountTemplate[]> {
  try {
    const response = await apiClient.get<QuickDiscountTemplate[]>('/api/loyalty/templates');
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      // Эндпоинт может быть не реализован - возвращаем пустой массив
      return [];
    }
    throw error;
  }
}

/**
 * Получить статус системы лояльности (все скидки)
 * GET /api/loyalty/status
 */
export async function getLoyaltyStatus(): Promise<LoyaltySystemStatus> {
  const response = await apiClient.get<LoyaltySystemStatus>('/api/loyalty/status');
  return response.data;
}

/**
 * Создать быструю скидку
 * POST /api/loyalty/quick-discounts
 */
export async function createQuickDiscount(data: LoyaltyDiscountCreate): Promise<LoyaltyDiscount> {
  const response = await apiClient.post<LoyaltyDiscount>('/api/loyalty/quick-discounts', data);
  return response.data;
}

/**
 * Обновить быструю скидку
 * PUT /api/loyalty/quick-discounts/{id}
 */
export async function updateQuickDiscount(
  id: number,
  data: LoyaltyDiscountUpdate
): Promise<LoyaltyDiscount> {
  const response = await apiClient.put<LoyaltyDiscount>(`/api/loyalty/quick-discounts/${id}`, data);
  return response.data;
}

/**
 * Удалить быструю скидку
 * DELETE /api/loyalty/quick-discounts/{id}
 */
export async function deleteQuickDiscount(id: number): Promise<void> {
  await apiClient.delete(`/api/loyalty/quick-discounts/${id}`);
}

/**
 * Массовая деактивация активных quick-правил одного condition_type.
 * POST /api/loyalty/quick-discounts/bulk-deactivate
 */
export async function bulkDeactivateQuickDiscountsByType(condition_type: string): Promise<{
  condition_type: string;
  deactivated: number;
  ids: number[];
}> {
  const response = await apiClient.post('/api/loyalty/quick-discounts/bulk-deactivate', {
    condition_type,
  });
  return response.data;
}

/**
 * Создать сложную скидку
 * POST /api/loyalty/complex-discounts
 */
import { normalizeConditionsForApi, isConditionTypeSupported } from '@src/utils/loyaltyConditions';

export async function createComplexDiscount(data: LoyaltyDiscountCreate): Promise<LoyaltyDiscount> {
  // Нормализуем conditions перед отправкой (единая точка нормализации)
  const normalizedConditions = normalizeConditionsForApi(data.conditions);
  
  // Валидация: проверяем, что condition_type поддерживается
  if (normalizedConditions.condition_type && !isConditionTypeSupported(normalizedConditions.condition_type)) {
    throw new Error(
      `Неподдерживаемый тип условия: ${normalizedConditions.condition_type}. ` +
      `Поддерживаемые типы: первая запись, возвращение клиента, регулярные визиты, счастливые часы, скидка на услуги`
    );
  }

  // Логирование для отладки
  if (__DEV__) {
    console.log('[loyalty_discounts] Creating complex discount:', {
      condition_type: normalizedConditions.condition_type,
      parameters: normalizedConditions.parameters,
      discount_name: data.name,
    });
  }

  const normalizedData = {
    ...data,
    conditions: normalizedConditions,
  };
  
  const response = await apiClient.post<LoyaltyDiscount>('/api/loyalty/complex-discounts', normalizedData);
  return response.data;
}

/**
 * Удалить сложную скидку
 * DELETE /api/loyalty/complex-discounts/{id}
 */
export async function deleteComplexDiscount(id: number): Promise<void> {
  await apiClient.delete(`/api/loyalty/complex-discounts/${id}`);
}

/**
 * Создать персональную скидку
 * POST /api/loyalty/personal-discounts
 */
export async function createPersonalDiscount(data: PersonalDiscountCreate): Promise<PersonalDiscount> {
  const response = await apiClient.post<PersonalDiscount>('/api/loyalty/personal-discounts', data);
  return response.data;
}

/**
 * Обновить сложную скидку
 * PUT /api/loyalty/complex-discounts/{id}
 */
export async function updateComplexDiscount(
  id: number,
  data: LoyaltyDiscountUpdate
): Promise<LoyaltyDiscount> {
  const response = await apiClient.put<LoyaltyDiscount>(
    `/api/loyalty/complex-discounts/${id}`,
    data
  );
  return response.data;
}

/**
 * Удалить персональную скидку
 * DELETE /api/loyalty/personal-discounts/{id}
 */
export async function deletePersonalDiscount(id: number): Promise<void> {
  await apiClient.delete(`/api/loyalty/personal-discounts/${id}`);
}

/**
 * Обновить персональную скидку
 * PUT /api/loyalty/personal-discounts/{id}
 */
export async function updatePersonalDiscount(
  id: number,
  data: PersonalDiscountUpdate
): Promise<PersonalDiscount> {
  const response = await apiClient.put<PersonalDiscount>(
    `/api/loyalty/personal-discounts/${id}`,
    data
  );
  return response.data;
}
