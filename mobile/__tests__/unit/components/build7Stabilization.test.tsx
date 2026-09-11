import React from 'react';
import { formatLocalDate } from '@src/utils/date';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const mockApi = {
  updateMasterDaySchedule: jest.fn().mockResolvedValue({}),
  getMasterServices: jest.fn(), getMasterServiceCategories: jest.fn(),
  deleteMasterServiceCategory: jest.fn(), deleteMasterService: jest.fn(),
  createMasterServiceCategory: jest.fn(), createMasterService: jest.fn(),
  updateMasterService: jest.fn(),
  getWeeklySchedule: jest.fn().mockResolvedValue({ slots: [] }),
  getDetailedBookings: jest.fn().mockResolvedValue([]),
  getMasterSettings: jest.fn().mockResolvedValue({ master: {} }),
};
jest.mock('@src/services/api/master', () => mockApi);
jest.mock('react-native', () => {
  const R = require('react');
  return {
    ...Object.fromEntries(['View', 'Text', 'FlatList', 'ScrollView', 'TouchableOpacity', 'Pressable', 'TextInput', 'Switch', 'ActivityIndicator', 'KeyboardAvoidingView', 'RefreshControl'].map(k => [k, k])),
    Modal: ({ visible, children, ...rest }: any) => visible ? R.createElement('Modal', rest, children) : null,
    StyleSheet: { create: (s: any) => s, absoluteFill: { position: 'absolute', inset: 0 } },
    Platform: { OS: 'ios', select: (s: any) => s.ios },
    Dimensions: { get: () => ({ width: 390, height: 844 }) },
    Keyboard: { dismiss: jest.fn(), addListener: () => ({ remove: jest.fn() }) },
    Alert: { alert: jest.fn() },
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: 'DateTimePicker' }));
jest.mock('@src/components/bookings/NoteSheet', () => ({ NoteSheet: () => null }));
jest.mock('@src/components/bookings/CancelReasonSheet', () => ({ CancelReasonSheet: () => null }));
jest.mock('@src/components/bookings/BookingCardCompact', () => ({ BookingCardCompact: 'BookingCard' }));
jest.mock('@src/components/ScreenContainer', () => ({ ScreenContainer: 'ScreenContainer' }));
jest.mock('@src/components/Card', () => ({ Card: 'Card' }));
jest.mock('@src/components/PrimaryButton', () => ({ PrimaryButton: 'PrimaryButton' }));
jest.mock('@src/components/SecondaryButton', () => ({ SecondaryButton: 'SecondaryButton' }));
jest.mock('@src/components/PlatformFeatureLock', () => ({ PlatformFeatureLock: 'PlatformFeatureLock' }));
jest.mock('@src/components/services/CategoryAccordion', () => ({ CategoryAccordion: 'CategoryAccordion' }));
jest.mock('@src/components/services/ServiceRow', () => ({ ServiceRow: 'ServiceRow' }));
jest.mock('@src/components/services/EntityActionSheet', () => ({ EntityActionSheet: 'EntityActionSheet' }));
jest.mock('@src/components/WebEditorButton', () => ({ WebEditorButton: () => null }));
jest.mock('@src/components/SegmentedControl', () => ({ SegmentedControl: 'SegmentedControl' }));
jest.mock('@src/components/schedule/RulesView', () => ({ RulesView: () => null }));
jest.mock('@src/contexts/TabBarHeightContext', () => ({ useTabBarHeight: () => ({ tabBarHeight: 60 }) }));

const { act, create } = require('react-test-renderer');
const { Alert, Keyboard, Platform } = require('react-native');
const { DayDrawer } = require('@src/components/schedule/DayDrawer');
const { DayView } = require('@src/components/schedule/DayView');
const { WeekView } = require('@src/components/schedule/WeekView');
const Services = require('../../../app/(master)/master/services').default;
const ScheduleScreen = require('../../../app/(master)/master/schedule').default;
let tree: any;
const pressText = async (text: string) => {
  const label = tree.root.findAll((n: any) => n.type === 'Text' && n.props.children === text)[0];
  let button = label.parent;
  while (button && !button.props.onPress) button = button.parent;
  await act(async () => { await button.props.onPress(); });
};
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockApi.updateMasterDaySchedule.mockResolvedValue({});
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null;
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe.each(['ios', 'android'])('schedule and services handlers on %s', os => {
  beforeEach(() => { Platform.OS = os; });
  it('open slot uses one native modal, posts correct day and refreshes', async () => {
    const refresh = jest.fn(), close = jest.fn();
    await act(async () => { tree = create(<DayDrawer visible date="2030-01-07" slots={[]} bookings={[]} onClose={close} onScheduleUpdated={refresh} />); });
    await pressText('Открыть слот');
    expect(tree.root.findAllByType('Modal')).toHaveLength(1);
    expect(tree.root.findByProps({ testID: 'open-slot-picker' })).toBeTruthy();
    await pressText('Добавить');
    expect(mockApi.updateMasterDaySchedule).toHaveBeenCalledWith('2030-01-07', expect.arrayContaining([{ hour: 9, minute: 0 }, { hour: 17, minute: 30 }]));
    expect(mockApi.updateMasterDaySchedule.mock.calls[0][1]).toHaveLength(18);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('close slots posts remaining slots; failure stays visible with an error', async () => {
    const close = jest.fn();
    await act(async () => { tree = create(<DayDrawer visible date="2030-01-07" bookings={[]} slots={[
      { hour: 9, minute: 0, is_working: true }, { hour: 9, minute: 30, is_working: true },
    ] as any} onClose={close} />); });
    await pressText('Закрыть слоты');
    expect(tree.root.findAllByType('Modal')).toHaveLength(1);
    await act(async () => tree.root.findAllByType('Switch')[0].props.onValueChange(true));
    mockApi.updateMasterDaySchedule.mockRejectedValueOnce({ response: { data: { detail: 'Дата 2026-09-06 уже прошла.' } } });
    await pressText('Применить');
    expect(mockApi.updateMasterDaySchedule).toHaveBeenCalledWith('2030-01-07', [{ hour: 9, minute: 30 }]);
    expect(Alert.alert).toHaveBeenCalledWith('Не удалось сохранить', 'Дата 06.09.2026 уже прошла.');
    expect(close).not.toHaveBeenCalled();
  });
  it('calendar press opens picker; chosen date drives selected day and week request', async () => {
    const changeWeek = jest.fn();
    await act(async () => { tree = create(<DayView schedule={{ slots: [] } as any} bookings={[]} weekOffset={0} onWeekChange={changeWeek} />); });
    await act(async () => tree.root.findByProps({ accessibilityLabel: 'Календарь, выбрать дату' }).props.onPress());
    await act(async () => tree.root.findByType('DateTimePicker').props.onChange({ type: 'set' }, new Date(2030, 0, 7)));
    await act(async () => tree.root.findByProps({ accessibilityLabel: 'Выбрать дату' }).props.onPress());
    expect(changeWeek).toHaveBeenCalledWith(expect.any(Number));
    expect(tree.root.findByType(DayDrawer).props.date).toBe('2030-01-07');
    expect(tree.root.findAllByType('DateTimePicker')).toHaveLength(0);
  });
  it('close success preserves a booked slot, refreshes and dismisses', async () => {
    const refresh = jest.fn(), close = jest.fn();
    await act(async () => { tree = create(<DayDrawer visible date="2030-01-07"
      slots={[{ hour: 9, minute: 0, is_working: true }, { hour: 9, minute: 30, is_working: true }] as any}
      bookings={[{ id: 1, start_time: '2030-01-07T09:00:00', end_time: '2030-01-07T09:30:00', status: 'confirmed' }] as any}
      onClose={close} onScheduleUpdated={refresh} />); });
    await pressText('Закрыть слоты');
    expect(tree.root.findAllByType('Switch')).toHaveLength(1);
    await act(async () => tree.root.findByType('Switch').props.onValueChange(true));
    await pressText('Применить');
    expect(mockApi.updateMasterDaySchedule).toHaveBeenCalledWith('2030-01-07', [{ hour: 9, minute: 0 }]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('real schedule screen retains selected calendar date through another-week refetch', async () => {
    await act(async () => { tree = create(<ScheduleScreen />); });
    await act(async () => tree.root.findByType('SegmentedControl').props.onSegmentChange(1));
    await act(async () => tree.root.findByProps({ accessibilityLabel: 'Календарь, выбрать дату' }).props.onPress());
    await act(async () => tree.root.findByType('DateTimePicker').props.onChange({ type: 'set' }, new Date(2030, 0, 7)));
    await act(async () => tree.root.findByProps({ accessibilityLabel: 'Выбрать дату' }).props.onPress());
    expect(mockApi.getWeeklySchedule).toHaveBeenCalledTimes(2);
    expect(tree.root.findByType(DayDrawer).props.date).toBe('2030-01-07');
  });
  it('category create preselects X, global create resets; picker dismisses keyboard', async () => {
    mockApi.getMasterServices.mockResolvedValue([]);
    mockApi.getMasterServiceCategories.mockResolvedValue([{ id: 8, name: 'Category X' }]);
    await act(async () => { tree = create(<Services />); });
    await act(async () => tree.root.findByType('CategoryAccordion').props.onCreateService());
    expect(tree.root.findAllByType('Text').some((n: any) => n.props.children === 'Category X')).toBe(true);
    await pressText('Category X');
    expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByType('ScrollView').some((n: any) => n.props.nestedScrollEnabled && n.props.keyboardShouldPersistTaps === 'handled')).toBe(true);
    await act(async () => tree.root.findAllByType('Modal')[0].props.onRequestClose());
    await pressText('+ Услуга');
    expect(tree.root.findAllByType('Text').some((n: any) => n.props.children === 'Выберите категорию *')).toBe(true);
  });
  it('category deletion refreshes preserved services into expanded Без категории', async () => {
    mockApi.getMasterServiceCategories.mockResolvedValue([{ id: 8, name: 'Category X' }]);
    mockApi.getMasterServices.mockResolvedValue([{ id: 9, category_id: 8, name: 'Preserved', price: 100, duration: 30 }]);
    mockApi.deleteMasterServiceCategory.mockImplementationOnce(async () => {
      mockApi.getMasterServiceCategories.mockResolvedValue([]);
      mockApi.getMasterServices.mockResolvedValue([{ id: 9, category_id: null, name: 'Preserved', price: 100, duration: 30 }]);
    });
    await act(async () => { tree = create(<Services />); });
    await act(async () => tree.root.findByType('CategoryAccordion').props.onCategoryMenuPress({ id: 8, name: 'Category X' }));
    await act(async () => tree.root.findAllByType('EntityActionSheet')[0].props.onDelete());
    await act(async () => tree.root.findAllByType('EntityActionSheet')[1].props.onConfirmDelete());
    expect(mockApi.deleteMasterServiceCategory).toHaveBeenCalledWith(8);
    const section = tree.root.findByType('CategoryAccordion');
    expect(section.props.category.name).toBe('Без категории');
    expect(section.props.isExpanded).toBe(true);
    expect(section.props.services).toEqual([expect.objectContaining({ id: 9, category_id: null })]);
    expect(mockApi.deleteMasterService).not.toHaveBeenCalled();
  });
});

function serviceState(categoryId: number | null = null, empty = false) {
  const state = {
    categories: empty ? [] as any[] : [{ id: 8, name: 'Category A' }],
    services: empty ? [] as any[] : [{ id: 9, name: 'Preserved', category_id: categoryId, price: 100, duration: 30, description: '' }],
  };
  mockApi.getMasterServiceCategories.mockImplementation(async () => state.categories);
  mockApi.getMasterServices.mockImplementation(async () => state.services);
  mockApi.createMasterServiceCategory.mockImplementation(async data => {
    const category = { id: 8, ...data };
    state.categories = [...state.categories, category];
    return category;
  });
  mockApi.createMasterService.mockImplementation(async data => {
    const service = { id: 9, ...data };
    state.services = [...state.services, service];
    return service;
  });
  mockApi.updateMasterService.mockImplementation(async (id, data) => {
    state.services = state.services.map(s => s.id === id ? { ...s, ...data, category_id: data.category_id ?? s.category_id } : s);
    return state.services.find(s => s.id === id);
  });
  mockApi.deleteMasterServiceCategory.mockImplementation(async () => {
    state.categories = [];
    state.services = state.services.map(s => ({ ...s, category_id: null }));
  });
  return state;
}

const editPreservedService = async (service: any) => {
  const section = tree.root.findAllByType('CategoryAccordion').find((n: any) => n.props.services.some((s: any) => s.id === service.id));
  await act(async () => section.props.renderService(service).props.onMenuPress(service));
  await act(async () => tree.root.findAllByType('EntityActionSheet')[0].props.onEdit());
};
const changeServiceField = async (placeholder: string, text: string) => {
  await act(async () => tree.root.findByProps({ placeholder }).props.onChangeText(text));
};
const saveServiceForm = async () => {
  await act(async () => tree.root.findByProps({ title: 'Сохранить', loading: false }).props.onPress());
};

describe.each(['ios', 'android'])('null-category editing on %s', os => {
  beforeEach(() => { Platform.OS = os; });

  it.each(['100', '100.5', '100,5', '100.50', '100,50', '0'])('service price %s and cleared description survive refetch', async input => {
    const state = serviceState();
    state.services[0].description = 'Old description';
    await act(async () => { tree = create(<Services />); });
    await editPreservedService(state.services[0]);
    await changeServiceField('Цена, ₽ *', input);
    await changeServiceField('Описание услуги', '');
    await saveServiceForm();
    expect(mockApi.updateMasterService).toHaveBeenCalledWith(9, expect.objectContaining({ price: Number(input.replace(',', '.')), description: '', category_id: null }));
    const preserved = tree.root.findAllByType('CategoryAccordion').flatMap((section: any) => section.props.services).find((service: any) => service.id === 9);
    expect(preserved.description).toBe('');
  });

  it('malformed price is not partially submitted', async () => {
    const state = serviceState();
    await act(async () => { tree = create(<Services />); });
    await editPreservedService(state.services[0]);
    await changeServiceField('Цена, ₽ *', '100,5,2');
    await saveServiceForm();
    expect(mockApi.updateMasterService).not.toHaveBeenCalled();
  });

  it.each([[{ loc: ['body', 'price'], msg: 'private diagnostic' }], { internal: 'private diagnostic' }])('structured error is a safe string and editor remains usable', async detail => {
    const state = serviceState();
    mockApi.updateMasterService.mockRejectedValueOnce({ response: { data: { detail } } });
    await act(async () => { tree = create(<Services />); });
    await editPreservedService(state.services[0]);
    await saveServiceForm();
    const message = Alert.alert.mock.calls.at(-1)[1];
    expect(typeof message).toBe('string');
    expect(message).not.toMatch(/private|\[object Object\]/);
    expect(tree.root.findAllByType('Modal')).toHaveLength(1);
  });

  it.each([null, 8])('ordinary edit retains category %s and remains visible after refetch', async categoryId => {
    const state = serviceState(categoryId);
    await act(async () => { tree = create(<Services />); });
    await editPreservedService(state.services[0]);
    if (categoryId === null) expect(tree.root.findAllByType('Text').some((n: any) => n.props.children === 'Без категории')).toBe(true);
    await changeServiceField('Название услуги *', 'Edited service');
    await changeServiceField('Цена, ₽ *', '250');
    await changeServiceField('Описание услуги', 'Edited description');
    await saveServiceForm();
    expect(mockApi.updateMasterService).toHaveBeenCalledWith(9, expect.objectContaining({
      name: 'Edited service', price: 250, description: 'Edited description', category_id: categoryId,
    }));
    const section = tree.root.findAllByType('CategoryAccordion').find((n: any) => n.props.services.length);
    expect(section.props.services).toEqual([expect.objectContaining({ id: 9, name: 'Edited service', category_id: categoryId })]);
    expect(section.props.category.name).toBe(categoryId === null ? 'Без категории' : 'Category A');
    expect(tree.root.findAllByType('Modal')).toHaveLength(0);
  });

  it.each([true, false])('optional category assignment, keep assignment=%s', async assign => {
    const state = serviceState();
    await act(async () => { tree = create(<Services />); });
    await editPreservedService(state.services[0]);
    await pressText('Без категории');
    await pressText('Category A');
    if (!assign) {
      await pressText('Category A');
      await pressText('Без категории');
    }
    await saveServiceForm();
    expect(mockApi.updateMasterService).toHaveBeenCalledWith(9, expect.objectContaining({ category_id: assign ? 8 : null }));
    expect(state.services[0].category_id).toBe(assign ? 8 : null);
  });

  it.each(['Название услуги *', 'Цена, ₽ *'])('missing %s still prevents edit', async field => {
    const state = serviceState();
    await act(async () => { tree = create(<Services />); });
    await editPreservedService(state.services[0]);
    await changeServiceField(field, '');
    await saveServiceForm();
    expect(mockApi.updateMasterService).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Не заполнены обязательные поля', expect.any(String), expect.any(Array));
    expect(state.services[0].category_id).toBeNull();
  });

  it('create still requires a category; valid categorized create succeeds', async () => {
    const state = serviceState(null, true);
    state.categories = [{ id: 8, name: 'Category A' }];
    await act(async () => { tree = create(<Services />); });
    await pressText('+ Услуга');
    await changeServiceField('Название услуги *', 'Created service');
    await changeServiceField('Цена, ₽ *', '100');
    await saveServiceForm();
    expect(mockApi.createMasterService).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Не выбрана категория', expect.any(String), expect.any(Array));
    await pressText('Выберите категорию *');
    await pressText('Category A');
    await saveServiceForm();
    expect(mockApi.createMasterService).toHaveBeenCalledWith(expect.objectContaining({ category_id: 8 }));
    expect(state.services).toHaveLength(1);
  });

  it('backend error leaves edit usable and retry does not lose the service', async () => {
    const state = serviceState();
    await act(async () => { tree = create(<Services />); });
    await editPreservedService(state.services[0]);
    await changeServiceField('Название услуги *', 'Retry service');
    mockApi.updateMasterService.mockRejectedValueOnce(new Error('Local save failure'));
    await saveServiceForm();
    expect(tree.root.findAllByType('Modal')).toHaveLength(1);
    expect(state.services[0].name).toBe('Preserved');
    await saveServiceForm();
    expect(state.services).toEqual([expect.objectContaining({ name: 'Retry service', category_id: null })]);
    expect(tree.root.findAllByType('Modal')).toHaveLength(0);
  });

  it('create category/service → delete category → edit preserved service end-to-end', async () => {
    const state = serviceState(null, true);
    await act(async () => { tree = create(<Services />); });
    await pressText('+ Категория');
    await changeServiceField('Название категории *', 'Category A');
    await saveServiceForm();
    await act(async () => tree.root.findByType('CategoryAccordion').props.onCreateService());
    await changeServiceField('Название услуги *', 'Created service');
    await changeServiceField('Цена, ₽ *', '100');
    await saveServiceForm();
    expect(state.services[0].category_id).toBe(8);
    await act(async () => tree.root.findByType('CategoryAccordion').props.onCategoryMenuPress(state.categories[0]));
    await act(async () => tree.root.findAllByType('EntityActionSheet')[0].props.onDelete());
    await act(async () => tree.root.findAllByType('EntityActionSheet')[1].props.onConfirmDelete());
    expect(state.categories).toEqual([]);
    expect(tree.root.findByType('CategoryAccordion').props.category.name).toBe('Без категории');
    await editPreservedService(state.services[0]);
    await changeServiceField('Название услуги *', 'Edited after delete');
    await saveServiceForm();
    expect(mockApi.updateMasterService).toHaveBeenCalledWith(9, expect.objectContaining({ category_id: null }));
    expect(tree.root.findByType('CategoryAccordion').props.services).toEqual([
      expect.objectContaining({ id: 9, name: 'Edited after delete', category_id: null }),
    ]);
    expect(mockApi.deleteMasterService).not.toHaveBeenCalled();
  });
});

describe.each(['ios', 'android'])('local weekday identity and response ordering on %s', os => {
  beforeEach(() => { Platform.OS = os; });
  it.each([
    [13, 'Следующий день', '2030-01-14', 1],
    [14, 'Предыдущий день', '2030-01-13', -1],
  ])('day arrows cross the loaded week from January %s', async (day, label, expected, offset) => {
    jest.setSystemTime(new Date(2030, 0, Number(day), 12));
    mockApi.getWeeklySchedule.mockResolvedValue({ slots: [] });
    await act(async () => { tree = create(<ScheduleScreen />); });
    await act(async () => tree.root.findByType('SegmentedControl').props.onSegmentChange(1));
    await act(async () => tree.root.findByProps({ accessibilityLabel: label }).props.onPress());
    expect(mockApi.getWeeklySchedule).toHaveBeenLastCalledWith(offset, 1);
    expect(mockApi.getWeeklySchedule).toHaveBeenCalledTimes(2);
    expect(tree.root.findByType(DayDrawer).props.date).toBe(expected);
  });

  it.each([[false, 2], [true, 2], [false, 3], [true, 3]])('schedule response ordering error=%s, weeks=%s', async (failOld, weekCount) => {
    const pending: Array<{ resolve: (value: any) => void; reject: (error: Error) => void }> = [];
    mockApi.getWeeklySchedule.mockImplementationOnce(async () => ({ slots: [] })).mockImplementation(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
    await act(async () => { tree = create(<ScheduleScreen />); });
    for (let offset = 1; offset <= Number(weekCount); offset++) {
      await act(async () => tree.root.findByType(WeekView).props.onWeekChange(offset));
    }
    const current = { slots: [], week: 'current' };
    await act(async () => pending[Number(weekCount) - 1].resolve(current));
    if (weekCount === 3) await act(async () => pending[1].resolve({ slots: [], week: 'B' }));
    await act(async () => failOld ? pending[0].reject(new Error('old A error')) : pending[0].resolve({ slots: [], week: 'A' }));
    expect(tree.root.findByType(WeekView).props.schedule).toEqual(current);
    expect(tree.root.findByType(WeekView).props.weekOffset).toBe(weekCount);
    expect(mockApi.getWeeklySchedule).toHaveBeenCalledTimes(1 + Number(weekCount));
    mockApi.getWeeklySchedule.mockResolvedValue({ slots: [] });
  });

  it('real WeekView headers select matching Mon..Sun calendar dates', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 11, 0, 15));
    try {
      await act(async () => { tree = create(<WeekView schedule={{ slots: [] }} bookings={[]} weekOffset={0} onWeekChange={jest.fn()} />); });
      for (const [i, day] of ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].entries()) {
        await pressText(day);
        expect(tree.root.findByType(DayDrawer).props.date).toBe(`2026-09-${String(7 + i).padStart(2, '0')}`);
        await act(async () => tree.root.findByType(DayDrawer).props.onClose());
      }
    } finally { jest.useRealTimers(); }
  });
  it.each([0, 1, 2, 3, 4, 5, 6])('does not shift weekday %s at local midnight', i => {
    expect(formatLocalDate(new Date(2026, 8, 7 + i, 0, 15))).toBe(`2026-09-${String(7 + i).padStart(2, '0')}`);
  });
});
