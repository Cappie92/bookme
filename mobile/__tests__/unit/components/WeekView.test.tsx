import React from 'react';
import type { Booking, ScheduleWeek } from '@src/services/api/master';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native', () => {
  const ReactLib = require('react');
  const scrollToOffset = jest.fn();
  (globalThis as { __weekScrollToOffset?: jest.Mock }).__weekScrollToOffset = scrollToOffset;
  const named = Object.fromEntries(
    ['View', 'Text', 'ScrollView', 'TouchableOpacity', 'Pressable'].map((name) => [name, name])
  );
  const FlatList = ReactLib.forwardRef(function FlatList(props: {
    data?: unknown[];
    renderItem?: (info: { item: unknown; index: number }) => React.ReactNode;
    renderScrollComponent?: (scrollProps: { children?: React.ReactNode; scrollsToTop?: boolean }) => React.ReactElement;
    scrollsToTop?: boolean;
  }, ref: React.Ref<{ scrollToOffset: jest.Mock }>) {
    ReactLib.useImperativeHandle(ref, () => ({ scrollToOffset }));
    (globalThis as { __weekFlatListProps?: typeof props }).__weekFlatListProps = props;
    const cells = (props.data || []).map((item, index) =>
      ReactLib.createElement(ReactLib.Fragment, { key: String(index) }, props.renderItem?.({ item, index }))
    );
    if (typeof props.renderScrollComponent === 'function') {
      // Real VirtualizedList: cloneElement(renderScrollComponent(scrollProps), { ref }, cells)
      // replaces whatever children the scroll component returned.
      const decoy = ReactLib.createElement('decoy-scroll-child', { testID: 'decoy-scroll-child' });
      const produced = props.renderScrollComponent({
        children: decoy,
        scrollsToTop: props.scrollsToTop,
      });
      return ReactLib.cloneElement(produced, { ref: null }, cells);
    }
    return ReactLib.createElement('FlatList', props, cells);
  });
  return {
    ...named,
    FlatList,
    Alert: { alert: jest.fn() },
    Platform: { OS: 'ios' },
    Dimensions: { get: () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }) },
    StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@src/components/schedule/DayDrawer', () => ({ DayDrawer: 'DayDrawer' }));
jest.mock('@src/components/schedule/CalendarB3Sheet', () => ({ CalendarB3Sheet: () => null }));
jest.mock('@src/services/api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const { act, create } = require('react-test-renderer');
const { WeekView } = require('@src/components/schedule/WeekView');

const MONDAY = '2030-01-07';
const pixelsPerMinute = 40 / 30;
const columnWidth = (390 - 60) / 7;
const schedule: ScheduleWeek = {
  week_start: MONDAY,
  week_end: '2030-01-13',
  slots: [],
};

function booking(id: number, date: string, start: string, end: string): Booking {
  return {
    id,
    start_time: `${date}T${start}:00`,
    end_time: `${date}T${end}:00`,
    status: 'confirmed',
    service_name: `Service ${id}`,
    client_name: `Demo ${id}`,
    service_price: 500,
    service_duration: 30,
  } as Booking;
}

function style(node: { props: { style?: unknown } }): Record<string, number> {
  return Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
}

let tree: { root: { findAll: (predicate: (node: any) => boolean) => any[]; findByProps: (props: Record<string, unknown>) => any }; unmount: () => void; update: (element: React.ReactElement) => void };
async function render(bookings: Booking[], week: ScheduleWeek = schedule) {
  await act(async () => {
    tree = create(
      <WeekView schedule={week} bookings={bookings} weekOffset={0} onWeekChange={jest.fn()} />
    );
  });
}
function cards() {
  return tree.root.findAll(
    (node) => node.type === 'Pressable' && /^week-booking-/.test(node.props.testID || '')
  );
}
function card(id: number) {
  return cards().find((node) => node.props.testID === `week-booking-${id}`);
}

function slotCell(testID: string) {
  return tree.root.findAll(
    (node) => node.type === 'Pressable' && node.props.testID === testID
  )[0];
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2030, 0, 7, 9));
  (globalThis as { __weekScrollToOffset?: jest.Mock }).__weekScrollToOffset?.mockClear();
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = undefined as unknown as typeof tree;
  jest.useRealTimers();
});

describe('WeekView continuous booking rendering', () => {
  it.each([
    [30, '12:30'],
    [60, '13:00'],
    [90, '13:30'],
    [120, '14:00'],
  ])('renders a %i-minute booking once across its real interval', async (minutes, end) => {
    await render([booking(1, MONDAY, '12:00', end)]);
    expect(cards()).toHaveLength(1);
    expect(style(cards()[0])).toMatchObject({
      top: 720 * pixelsPerMinute,
      height: Number(minutes) * pixelsPerMinute,
      left: 60,
    });
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === 'Service 1')).toHaveLength(1);
  });

  it('regression: 12:00–13:30 is one 90-minute block, not repeated 12:30/13:00 cards', async () => {
    await render([booking(1, MONDAY, '12:00', '13:30')]);
    expect(cards().map((node) => node.props.testID)).toEqual(['week-booking-1']);
    expect(style(cards()[0]).height / pixelsPerMinute).toBe(90);
    expect(style(cards()[0]).top / pixelsPerMinute).toBe(720);
    const halfHourCards = cards().filter((node) => {
      const topMinute = style(node).top / pixelsPerMinute;
      return topMinute === 750 || topMinute === 780;
    });
    expect(halfHourCards).toHaveLength(0);
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === '12:00')).toHaveLength(2);
  });

  it('keeps a non-grid 12:10–13:40 booking as one block', async () => {
    await render([booking(1, MONDAY, '12:10', '13:40')]);
    expect(cards()).toHaveLength(1);
    expect(style(cards()[0]).top).toBeCloseTo(730 * pixelsPerMinute);
    expect(style(cards()[0]).height).toBeCloseTo(90 * pixelsPerMinute);
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === 'Service 1')).toHaveLength(1);
  });

  it('places adjacent bookings edge to edge in one day column', async () => {
    await render([
      booking(1, MONDAY, '12:00', '13:30'),
      booking(2, MONDAY, '13:30', '15:00'),
    ]);
    expect(cards()).toHaveLength(2);
    const first = style(card(1));
    const second = style(card(2));
    expect(first.top + first.height).toBeCloseTo(second.top);
    expect(first.left).toBeCloseTo(second.left);
    expect(second.top).toBeGreaterThanOrEqual(first.top + first.height - 0.01);
  });

  it('puts bookings on their own day columns', async () => {
    await render([
      booking(1, MONDAY, '12:00', '13:00'),
      booking(2, '2030-01-09', '12:00', '13:30'),
    ]);
    expect(cards()).toHaveLength(2);
    expect(style(card(2)).left - style(card(1)).left).toBeCloseTo(2 * columnWidth);
    expect(style(card(1)).height / pixelsPerMinute).toBe(60);
    expect(style(card(2)).height / pixelsPerMinute).toBe(90);
  });

  it('anchors bookings to the working-day start and end', async () => {
    await render([
      booking(1, MONDAY, '07:00', '07:30'),
      booking(2, MONDAY, '21:00', '22:00'),
    ]);
    expect(cards()).toHaveLength(2);
    expect(style(card(1))).toMatchObject({ top: 420 * pixelsPerMinute, height: 30 * pixelsPerMinute });
    expect(style(card(2))).toMatchObject({ top: 1260 * pixelsPerMinute, height: 60 * pixelsPerMinute });
    expect(tree.root.findAll((node) => node.type === 'View' && style(node).width === 60 && style(node).height === 40)).toHaveLength(48);
  });

  it('keeps the booking overlay after VirtualizedList replaces scroll children', async () => {
    await render([booking(1, MONDAY, '12:00', '13:30')]);
    expect(tree.root.findAll((node) => node.props.testID === 'decoy-scroll-child')).toHaveLength(0);
    expect(cards()).toHaveLength(1);
    const cardStyle = style(cards()[0]);
    expect(cardStyle).toMatchObject({
      top: 720 * pixelsPerMinute,
      height: 90 * pixelsPerMinute,
      left: 60,
      zIndex: 2,
      elevation: 2,
    });
    expect(typeof cards()[0].props.onPress).toBe('function');
    const layer = tree.root.findByProps({ testID: 'week-booking-layer' });
    const slot = slotCell('week-slot-2030-01-07-12-0');
    const scrollOf = (node: { parent?: { type?: string; parent?: unknown } | null }) => {
      let current: { type?: string; parent?: unknown } | null | undefined = node;
      while (current && current.type !== 'ScrollView') current = current.parent as typeof current;
      return current;
    };
    expect(scrollOf(layer)).toBe(scrollOf(slot));
    await act(async () => {
      cards()[0].props.onPress();
    });
    expect(tree.root.findByProps({ date: MONDAY }).type).toBe('DayDrawer');
  });

  it('paints working and non-working slots under one booking overlay', async () => {
    const week: ScheduleWeek = {
      week_start: MONDAY,
      week_end: '2030-01-13',
      slots: [
        { schedule_date: MONDAY, hour: 12, minute: 0, is_working: true, has_conflict: false },
        { schedule_date: MONDAY, hour: 12, minute: 30, is_working: false, has_conflict: false },
        { schedule_date: '2030-01-09', hour: 12, minute: 0, is_available: true, is_working: false, has_conflict: false },
      ],
    };
    await render([booking(1, MONDAY, '12:00', '13:30')], week);
    expect(cards()).toHaveLength(1);
    expect(style(slotCell('week-slot-2030-01-07-12-0')).backgroundColor).toBe('#E8F5E9');
    expect(style(slotCell('week-slot-2030-01-07-12-30')).backgroundColor).toBe('#fff');
    expect(style(slotCell('week-slot-2030-01-09-12-0')).backgroundColor).toBe('#E8F5E9');
    expect(style(cards()[0]).backgroundColor).toBe('#FFF3E0');
  });
});

function weekScrollToOffset(): jest.Mock {
  return (globalThis as unknown as { __weekScrollToOffset: jest.Mock }).__weekScrollToOffset;
}
function weekListProps(): {
  initialScrollIndex: number;
  scrollsToTop?: boolean;
  getItemLayout: (data: null, index: number) => { length: number; offset: number; index: number };
  onScrollToIndexFailed: (info: { index: number; averageItemLength: number }) => void;
} {
  return (globalThis as unknown as { __weekFlatListProps: ReturnType<typeof weekListProps> }).__weekFlatListProps;
}

describe('WeekView initial scroll', () => {
  it('opens at 09:00 and does not schedule a second delayed scroll', async () => {
    await render([]);
    expect(weekListProps().initialScrollIndex).toBe(18);
    expect(weekListProps().getItemLayout(null, 18)).toEqual({ length: 40, offset: 720, index: 18 });
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(weekScrollToOffset()).not.toHaveBeenCalled();
    await act(async () => {
      weekListProps().onScrollToIndexFailed({ index: 3, averageItemLength: 10 });
    });
    expect(weekScrollToOffset()).toHaveBeenCalledTimes(1);
    expect(weekScrollToOffset()).toHaveBeenCalledWith({ offset: 720, animated: false });
  });

  it('does not repeat the opening scroll after bookings, schedule, or week changes', async () => {
    await render([booking(1, MONDAY, '12:00', '13:00')]);
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(weekScrollToOffset()).not.toHaveBeenCalled();
    await act(async () => {
      tree.update(
        <WeekView
          schedule={{ ...schedule, slots: [{ schedule_date: MONDAY, hour: 9, minute: 0, is_working: true, has_conflict: false }] }}
          bookings={[booking(1, MONDAY, '12:00', '13:00'), booking(2, MONDAY, '15:00', '16:00')]}
          weekOffset={1}
          onWeekChange={jest.fn()}
        />
      );
    });
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(weekScrollToOffset()).not.toHaveBeenCalled();
    expect(weekListProps().initialScrollIndex).toBe(18);
  });

  it('disables native scroll-to-top on the week timeline', async () => {
    await render([]);
    expect(weekListProps().scrollsToTop).toBe(false);
    const timelines = tree.root.findAll((node: { type?: unknown; props?: { scrollsToTop?: boolean } }) => node.type === 'ScrollView');
    expect(timelines).toHaveLength(1);
    expect(timelines[0].props.scrollsToTop).toBe(false);
  });
});
