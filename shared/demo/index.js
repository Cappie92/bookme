/**
 * Демо-данные для платных разделов (Клиенты, Финансы, Лояльность, Правила, Статистика).
 * Единый источник для web и mobile. Не создаёт записей в БД.
 * Импорт: import { clientsDemo, financeSummaryDemo } from '../shared/demo'
 */

export { clientsDemo } from './clients.js';
export { financeSummaryDemo, financeOperationsDemo } from './finance.js';
export { loyaltyQuickDiscountsDemo, loyaltyStatsDemo, loyaltyHistoryDemo } from './loyalty.js';
export { rulesRestrictionsDemo, rulesAutoRulesDemo } from './rules.js';
export { statsDemo } from './stats.js';
