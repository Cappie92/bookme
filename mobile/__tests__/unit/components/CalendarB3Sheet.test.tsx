import React from 'react';
import type { Booking } from '@src/services/api/master';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native', () => {
  const ReactLib = require('react');
  const named = Object.fromEntries(
    ['View', 'Text', 'ScrollView', 'TouchableOpacity', 'TextInput', 'ActivityIndicator'].map((name) => [name, name])
  );
  return {
    ...named,
    Modal: (props: { children?: React.ReactNode }) => ReactLib.createElement('Modal', props, props.children),
    StyleSheet: { create: (styles: unknown) => styles },
  };
});
jest.mock('@src/services/api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const { act, create } = require('react-test-renderer');
const { apiClient } = require('@src/services/api/client');
const { CalendarB3Sheet } = require('@src/components/schedule/CalendarB3Sheet');

const booking = {
  id: 7,
  version: 2,
  client_name: 'Анна',
  guest_name: 'Анна',
  service_id: 0,
  service_name: '',
  service_duration: 60,
  start_time: '2030-01-07T10:00:00',
  end_time: '2030-01-07T11:00:00',
  status: 'confirmed',
  notes: null,
  client_id: null,
  master_id: 1,
  indie_master_id: null,
  salon_id: null,
  branch_id: null,
  payment_method: null,
  payment_amount: null,
  created_at: null,
  updated_at: null,
} as Booking;

function conflict() {
  return Promise.reject({
    response: { status: 409, headers: { 'x-error-code': 'CALENDAR_VERSION_CONFLICT' }, data: { detail: 'changed' } },
  });
}

async function press(tree: any, label: string) {
  const button = tree.root.findAll((node: any) => node.type === 'TouchableOpacity' && node.props.children?.props?.children === label)[0];
  await act(async () => {
    await button.props.onPress();
  });
}

describe('CalendarB3Sheet delete version conflict', () => {
  beforeEach(() => {
    apiClient.get.mockResolvedValue({ data: [] });
    apiClient.delete.mockReset();
  });

  it('retries a manual delete with the refreshed server version', async () => {
    const versions: number[] = [];
    apiClient.delete.mockImplementation((url: string) => {
      const version = Number(new URL(`http://local${url}`).searchParams.get('version'));
      versions.push(version);
      return version === 2 ? conflict() : Promise.resolve({ data: { id: 7, version: 4 } });
    });
    const onReload = jest.fn(async () => ({
      bookings: [{ ...booking, version: 3 }],
      blocks: [],
    }));
    const onSaved = jest.fn();
    let tree: any;
    await act(async () => {
      tree = create(<CalendarB3Sheet visible mode="manual" date="2030-01-07" event={booking}
        bookings={[booking]} blocks={[]} onClose={jest.fn()} onSaved={onSaved} onReload={onReload} />);
    });
    await press(tree!, 'Отменить запись');
    expect(versions).toEqual([2]);
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(tree!.root.findAll((node: { type: string; props: { children?: unknown } }) => node.type === 'Text' && String(node.props.children).includes('version 3')).length).toBeGreaterThan(0);
    await press(tree!, 'Отменить запись');
    expect(versions).toEqual([2, 3]);
    expect(onSaved).toHaveBeenCalledTimes(1);
    tree!.unmount();
  });

  it('retries a block delete with the refreshed server version', async () => {
    const block = {
      id: 8, version: 2, category: 'personal', title: 'Врач',
      start_time: '2030-01-07T15:00:00', end_time: '2030-01-07T16:00:00', master_id: 1,
    };
    const versions: number[] = [];
    apiClient.delete.mockImplementation((url: string) => {
      const version = Number(new URL(`http://local${url}`).searchParams.get('version'));
      versions.push(version);
      return version === 2 ? conflict() : Promise.resolve({ data: { id: 8, version: 4 } });
    });
    const onReload = jest.fn(async () => ({ bookings: [], blocks: [{ ...block, version: 3 }] }));
    let tree: any;
    await act(async () => {
      tree = create(<CalendarB3Sheet visible mode="block" date="2030-01-07" event={block}
        bookings={[]} blocks={[block]} onClose={jest.fn()} onSaved={jest.fn()} onReload={onReload} />);
    });
    await press(tree!, 'Удалить блок');
    await press(tree!, 'Удалить блок');
    expect(versions).toEqual([2, 3]);
    tree!.unmount();
  });
});
