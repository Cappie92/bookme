import React, { useState, useEffect, type ReactElement } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { getScheduleRules, createScheduleRule } from '@src/services/api/master';
import { RuleBuilderModal } from './RuleBuilderModal';

interface RulesViewProps {
  onRuleCreated?: () => void;
  refreshControl?: ReactElement;
  /** Инкремент родителем — повторная загрузка правил (pull-to-refresh) */
  externalReloadToken?: number;
}

export function RulesView({
  onRuleCreated,
  refreshControl,
  externalReloadToken = 0,
}: RulesViewProps = {}) {
  const [rules, setRules] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showRuleBuilder, setShowRuleBuilder] = useState(false);

  const loadRules = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    try {
      if (!silent) setLoading(true);
      const data = await getScheduleRules();
      setRules(data);
    } catch (error: any) {
      console.error('Ошибка загрузки правил:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить правила расписания');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadRules({ silent: externalReloadToken > 0 });
  }, [externalReloadToken]);

  const handleRuleCreated = () => {
    setShowRuleBuilder(false);
    loadRules(); // Перезагружаем правила после создания
    if (onRuleCreated) {
      onRuleCreated(); // Уведомляем родительский компонент
    }
  };

  const formatRuleType = (type: string) => {
    switch (type) {
      case 'weekdays':
        return 'Дни недели';
      case 'monthdays':
        return 'Числа месяца';
      case 'shift':
        return 'Сменный график';
      default:
        return type;
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Не указано';
    try {
      // TODO: если сюда придёт дата формата YYYY-MM-DD (например, validUntil, effectiveStartDate из fixed_schedule)
      // — использовать parseLocalDate() из @src/utils/date вместо new Date(dateString)
      // Сейчас используется для created_at/updated_at (datetime), но в будущем может прийти YYYY-MM-DD
      const date = new Date(dateString);
      return date.toLocaleDateString('ru-RU', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      });
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Загрузка...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        {!rules || !rules.has_settings ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Правила расписания не настроены</Text>
            <Text style={styles.emptyText}>
              Создайте правило расписания, чтобы автоматически управлять доступностью
            </Text>
          </View>
        ) : (
          <View style={styles.rulesContainer}>
            <Text style={styles.sectionTitle}>Текущие настройки расписания</Text>
            
            {rules.fixed_schedule && (
              <View style={styles.ruleCard}>
                <View style={styles.ruleHeader}>
                  <Text style={styles.ruleType}>
                    {formatRuleType(rules.fixed_schedule.type || 'unknown')}
                  </Text>
                  {rules.created_at && (
                    <Text style={styles.ruleDate}>
                      Создано: {formatDate(rules.created_at)}
                    </Text>
                  )}
                </View>
                
                {rules.updated_at && (
                  <Text style={styles.ruleDate}>
                    Обновлено: {formatDate(rules.updated_at)}
                  </Text>
                )}

                {rules.fixed_schedule.validUntil && (
                  <Text style={styles.ruleDate}>
                    Действует до: {formatDate(rules.fixed_schedule.validUntil)}
                  </Text>
                )}

                {/* Детали правила */}
                {rules.fixed_schedule.type === 'weekdays' && rules.fixed_schedule.weekdays && (
                  <View style={styles.ruleDetails}>
                    <Text style={styles.ruleDetailsTitle}>Рабочие дни:</Text>
                    {Object.entries(rules.fixed_schedule.weekdays).map(([dayId, times]: [string, any]) => {
                      const dayNames = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
                      const dayFullNames = ['', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
                      const isNight = times.start && times.end && times.start > times.end;
                      return (
                        <Text key={dayId} style={styles.ruleDetailItem}>
                          {dayFullNames[parseInt(dayId)]}: {times.start}–{times.end}{isNight ? ' (ночь)' : ''}
                        </Text>
                      );
                    })}
                  </View>
                )}

                {rules.fixed_schedule.type === 'monthdays' && rules.fixed_schedule.monthdays && (
                  <View style={styles.ruleDetails}>
                    <Text style={styles.ruleDetailsTitle}>Числа месяца:</Text>
                    {Object.entries(rules.fixed_schedule.monthdays).map(([day, times]: [string, any]) => {
                      const isNight = times.start && times.end && times.start > times.end;
                      return (
                        <Text key={day} style={styles.ruleDetailItem}>
                          {day} число: {times.start}–{times.end}{isNight ? ' (ночь)' : ''}
                        </Text>
                      );
                    })}
                  </View>
                )}

                {rules.fixed_schedule.type === 'shift' && rules.fixed_schedule.shiftConfig && (
                  <View style={styles.ruleDetails}>
                    <Text style={styles.ruleDetailsTitle}>Сменный график:</Text>
                    <Text style={styles.ruleDetailItem}>
                      Рабочих дней: {rules.fixed_schedule.shiftConfig.workDays}
                    </Text>
                    <Text style={styles.ruleDetailItem}>
                      Нерабочих дней: {rules.fixed_schedule.shiftConfig.restDays}
                    </Text>
                    {rules.fixed_schedule.shiftConfig.startDate && (
                      <Text style={styles.ruleDetailItem}>
                        Начало: {formatDate(rules.fixed_schedule.shiftConfig.startDate)}
                      </Text>
                    )}
                    {rules.fixed_schedule.shiftConfig.workStartTime && rules.fixed_schedule.shiftConfig.workEndTime && (
                      <Text style={styles.ruleDetailItem}>
                        Время: {rules.fixed_schedule.shiftConfig.workStartTime}–{rules.fixed_schedule.shiftConfig.workEndTime}
                        {rules.fixed_schedule.shiftConfig.workStartTime > rules.fixed_schedule.shiftConfig.workEndTime ? ' (ночь)' : ''}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Кнопка создания правила */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowRuleBuilder(true)}
        >
          <Text style={styles.createButtonText}>Создать расписание</Text>
        </TouchableOpacity>
      </View>

      {/* Модальное окно создания правила */}
      <RuleBuilderModal
        visible={showRuleBuilder}
        onClose={() => setShowRuleBuilder(false)}
        onPreview={(rule) => {
          // TODO: Реализовать предпросмотр на week-grid
          console.log('Preview rule:', rule);
        }}
        weekDates={[]}
        onRuleCreated={handleRuleCreated}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
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
  content: {
    flex: 1,
    padding: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  rulesContainer: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  ruleCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  ruleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ruleType: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  ruleDate: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  ruleDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  ruleDetailsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  ruleDetailItem: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  createButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
