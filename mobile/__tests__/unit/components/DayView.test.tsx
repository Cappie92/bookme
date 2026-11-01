import React from 'react';
import type { Booking, ScheduleWeek } from '@src/services/api/master';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native', () => {
  const React = require('react');
  const scrollTo = jest.fn();
  (globalThis as { __dayScrollTo?: jest.Mock }).__dayScrollTo = scrollTo;
  const ScrollView = React.forwardRef((props: { children?: React.ReactNode }, ref: React.Ref<{ scrollTo: jest.Mock }>) => {
    React.useImperativeHandle(ref, () => ({ scrollTo }));
    return React.createElement('ScrollView', props, props.children);
  });
  return {
    ...Object.fromEntries(['View', 'Text', 'TouchableOpacity', 'Pressable', 'TextInput', 'ActivityIndicator'].map(name => [name, name])),
    ScrollView,
    Modal: () => null,
    StyleSheet: { create: (styles: any) => styles },
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: 'DateTimePicker' }));
jest.mock('@src/components/schedule/DayDrawer', () => ({ DayDrawer: 'DayDrawer' }));
jest.mock('@src/components/schedule/CalendarB3Sheet', () => ({ CalendarB3Sheet: () => null }));
jest.mock('@src/services/api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const { act, create } = require('react-test-renderer');
const { DayView } = require('@src/components/schedule/DayView');

const DATE = '2030-01-07';
const pixelsPerMinute = 2; // Existing scale: 60px per 30-minute row.
const schedule: ScheduleWeek = {
  week_start: DATE,
  week_end: '2030-01-13',
  slots: Array.from({ length: 48 }, (_, index) => ({
    schedule_date: DATE,
    hour: Math.floor(index / 2),
    minute: (index % 2) * 30,
    is_working: index >= 14 && index < 44,
    has_conflict: false,
  })),
};

function booking(id: number, start: string, end: string, status = 'confirmed'): Booking {
  return {
    id, start_time: `${DATE}T${start}:00`, end_time: `${DATE}T${end}:00`,
    status, service_name: `Service ${id}`, client_name: `Demo ${id}`,
    service_price: 500,
    // Deliberately not the booked duration: layout must use start/end, not catalog duration.
    service_duration: 30,
  } as Booking;
}

function style(node: any): any {
  return Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
}

let tree: any;
async function render(bookings: Booking[], slots = schedule.slots) {
  await act(async () => {
    tree = create(<DayView schedule={{ ...schedule, slots }} bookings={bookings}
      weekOffset={0} onWeekChange={jest.fn()} />);
  });
}
function cards() {
  return tree.root.findAll((node: any) => node.type === 'TouchableOpacity' && /^day-booking-/.test(node.props.testID || ''));
}
function freeRanges(): { start: number; end: number }[] {
  return tree.root.findAll((node: any) => node.type === 'View' && /^day-free-/.test(node.props.testID || ''))
    .map((node: any) => {
      const [, , start, end] = node.props.testID.split('-');
      return { start: Number(start), end: Number(end) };
    });
}
function expectNoFreeOverlap(start: number, end: number) {
  expect(freeRanges().filter(range => range.start < end && range.end > start)).toEqual([]);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2030, 0, 7, 9));
  (globalThis as { __dayScrollTo?: jest.Mock }).__dayScrollTo?.mockClear();
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = undefined;
  jest.useRealTimers();
});

describe('DayView continuous booking rendering', () => {
  it.each([
    [30, '12:30'], [60, '13:00'], [90, '13:30'], [120, '14:00'],
  ])('renders a %i-minute booking exactly once at its actual time', async (minutes, end) => {
    await render([booking(1, '12:00', String(end))]);
    expect(cards()).toHaveLength(1);
    expect(style(cards()[0])).toMatchObject({ top: 720 * pixelsPerMinute, height: Number(minutes) * pixelsPerMinute });
    expect(tree.root.findAll((node: any) => node.type === 'Text' && node.props.children === 'Service 1')).toHaveLength(1);
    const time = cards()[0].findAll((node: any) => node.type === 'Text')[0].props.children.join('');
    expect(time).toBe(`12:00–${end}`);
    expectNoFreeOverlap(720, 720 + Number(minutes));
    expect(freeRanges()).toContainEqual({ start: 690, end: 720 });
    expect(freeRanges()).toContainEqual({ start: 720 + Number(minutes), end: 750 + Number(minutes) });
  });

  it('regression: 12:00–13:30 has no repeated 12:30/13:00 cards and retains summary', async () => {
    await render([booking(1, '12:00', '13:30')]);
    expect(cards().map((node: any) => node.props.testID)).toEqual(['day-booking-1']);
    expect(style(cards()[0]).height / pixelsPerMinute).toBe(90);
    expectNoFreeOverlap(720, 810);
    expect(freeRanges().filter(range => range.start >= 720)[0].start).toBe(810);
    expect(tree.root.findAll((node: any) => node.type === 'Text' && Array.isArray(node.props.children) && node.props.children.join('') === '1.5 ч')).toHaveLength(1);
    expect(tree.root.findAll((node: any) => node.type === 'Text' && node.props.children === 1)).toHaveLength(1);
    expect(cards()[0].findAll((node: any) => node.type === 'Text' && node.props.children === 'Demo 1')).toHaveLength(1);
    expect(cards()[0].findAll((node: any) => node.type === 'Text' && node.props.children === '500 ₽')).toHaveLength(1);
    await act(async () => cards()[0].props.onPress());
    expect(tree.root.findByType('DayDrawer').props.visible).toBe(true);
  });

  it('renders adjacent and separated bookings with no invented free gap', async () => {
    await render([
      booking(3, '15:00', '16:00'), booking(2, '13:30', '14:00'), booking(1, '12:00', '13:30'),
    ]);
    expect(cards()).toHaveLength(3);
    expectNoFreeOverlap(720, 840);
    expectNoFreeOverlap(900, 960);
    expect(style(tree.root.findByProps({ testID: 'day-booking-2' }))).toMatchObject({ top: 1620, height: 60 });
    expect(freeRanges()).toContainEqual({ start: 840, end: 870 });
    expect(freeRanges()).toContainEqual({ start: 870, end: 900 });
  });

  it('preserves exact non-grid start/end and paints only the remaining free fragments', async () => {
    await render([booking(1, '12:10', '13:40')]);
    expect(cards()).toHaveLength(1);
    expect(style(cards()[0])).toMatchObject({ top: 1460, height: 180 });
    expectNoFreeOverlap(730, 820);
    expect(freeRanges()).toContainEqual({ start: 720, end: 730 });
    expect(freeRanges()).toContainEqual({ start: 820, end: 840 });
    const fragment = tree.root.findByProps({ testID: 'day-free-820-840' });
    expect(style(fragment)).toMatchObject({ top: 20, height: 40 });
  });

  it('handles working-day boundaries without marking non-working time free', async () => {
    await render([booking(1, '07:00', '07:30'), booking(2, '21:00', '22:00')]);
    expect(cards()).toHaveLength(2);
    expectNoFreeOverlap(420, 450);
    expectNoFreeOverlap(1260, 1320);
    expect(freeRanges().every(range => range.start >= 450 && range.end <= 1260)).toBe(true);
  });

  it('includes the final 23:30 row and supports midnight boundaries', async () => {
    const allDay = schedule.slots.map(slot => ({ ...slot, is_working: true }));
    const last = { ...booking(2, '23:30', '23:59'), end_time: '2030-01-08T00:00:00' };
    await render([booking(1, '00:00', '00:30'), last], allDay);
    expect(cards()).toHaveLength(2);
    expect(style(cards()[0])).toMatchObject({ top: 0, height: 60 });
    expect(style(cards()[1])).toMatchObject({ top: 2820, height: 60 });
    expect(tree.root.findAll((node: any) => node.type === 'View' && style(node).height === 60 && style(node).flexDirection === 'row')).toHaveLength(48);
    expectNoFreeOverlap(1410, 1440);
  });

  it('releases the visual range when the API removes a master-cancelled booking', async () => {
    await render([booking(1, '12:00', '13:30')]);
    // /master/bookings/detailed excludes CANCELLED. No new status policy in DayView.
    await act(async () => tree.update(<DayView schedule={schedule} bookings={[]}
      weekOffset={0} onWeekChange={jest.fn()} />));
    expect(cards()).toHaveLength(0);
    expect(freeRanges()).toEqual(expect.arrayContaining([
      { start: 720, end: 750 }, { start: 750, end: 780 }, { start: 780, end: 810 },
    ]));
  });

  it('does not silently filter client cancellation statuses supplied by the API', async () => {
    await render([booking(1, '12:00', '13:30', 'cancelled_by_client_early')]);
    expect(cards()).toHaveLength(1);
    expect(tree.root.findByType('DayDrawer').props.bookings[0].status).toBe('cancelled_by_client_early');
  });

  it('puts an overnight booking and a multiday block in the destination day drawer once', async () => {
    const overnight = {
      ...booking(9, '22:00', '23:00'),
      start_time: '2030-01-06T22:00:00',
      end_time: '2030-01-07T02:00:00',
    };
    const endedAtMidnight = {
      ...booking(8, '22:00', '23:00'),
      start_time: '2030-01-06T21:00:00',
      end_time: '2030-01-07T00:00:00',
    };
    await act(async () => {
      tree = create(<DayView schedule={schedule} bookings={[overnight, endedAtMidnight]}
        blocks={[{ id: 4, master_id: 1, category: 'busy', start_time: '2030-01-05T18:00:00', end_time: '2030-01-08T10:00:00', version: 1 }]}
        weekOffset={0} onWeekChange={jest.fn()} />);
    });
    expect(cards().map((node: any) => node.props.testID)).toEqual(['day-booking-9']);
    expect(style(cards()[0])).toMatchObject({ top: 0, height: 240 });
    const drawer = tree.root.findByType('DayDrawer').props;
    expect(drawer.bookings.map((item: Booking) => item.id)).toEqual([9]);
    expect(drawer.blocks.map((item: { id: number }) => item.id)).toEqual([4]);
  });
});

function dayScrollTo(): jest.Mock {
  return (globalThis as unknown as { __dayScrollTo: jest.Mock }).__dayScrollTo;
}
function timeline() {
  return tree.root.findAll((node: any) => node.type === 'ScrollView' && node.props.onLayout)[0];
}
async function markTimelineReady() {
  await act(async () => {
    timeline().props.onLayout();
    timeline().props.onContentSizeChange(390, 2880);
  });
}

describe('DayView initial scroll', () => {
  it('scrolls once to 09:00 only after the viewport and content are ready', async () => {
    await render([]);
    expect(timeline().props.contentOffset).toBeUndefined();
    expect(dayScrollTo()).not.toHaveBeenCalled();
    await act(async () => {
      timeline().props.onLayout();
    });
    expect(dayScrollTo()).not.toHaveBeenCalled();
    await act(async () => {
      timeline().props.onContentSizeChange(390, 2880);
    });
    expect(dayScrollTo()).toHaveBeenCalledTimes(1);
    expect(dayScrollTo()).toHaveBeenCalledWith({ y: 1080, animated: false });
    await act(async () => {
      timeline().props.onLayout();
      timeline().props.onContentSizeChange(390, 3000);
    });
    expect(dayScrollTo()).toHaveBeenCalledTimes(1);
    expect(dayScrollTo().mock.calls.every((call) => call[0].y === 1080)).toBe(true);
  });

  it('does not scroll again when bookings or schedule rerender', async () => {
    await render([booking(1, '12:00', '13:00')]);
    await markTimelineReady();
    expect(dayScrollTo()).toHaveBeenCalledTimes(1);
    await act(async () => {
      tree.update(<DayView schedule={{ ...schedule, slots: schedule.slots.slice(0, 20) }}
        bookings={[booking(1, '12:00', '13:00'), booking(2, '15:00', '16:00')]}
        weekOffset={0} onWeekChange={jest.fn()} />);
    });
    await act(async () => {
      timeline().props.onLayout();
      timeline().props.onContentSizeChange(390, 2880);
    });
    expect(dayScrollTo()).toHaveBeenCalledTimes(1);
  });

  it('does not start the opening scroll after the user drags', async () => {
    await render([]);
    await act(async () => {
      timeline().props.onScrollBeginDrag();
      timeline().props.onLayout();
      timeline().props.onContentSizeChange(390, 2880);
    });
    expect(dayScrollTo()).not.toHaveBeenCalled();
  });

  it('disables native scroll-to-top on the day timeline', async () => {
    await render([]);
    expect(timeline().props.scrollsToTop).toBe(false);
  });
});
