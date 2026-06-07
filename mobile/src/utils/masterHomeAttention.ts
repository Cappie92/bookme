import type { Booking } from '@src/services/api/bookings';
import {
  canConfirmPostVisit,
  canPreVisitConfirmBooking,
} from '@src/utils/bookingOutcome';

type MasterAttentionLike = {
  auto_confirm_bookings?: boolean;
  pre_visit_confirmations_effective?: boolean;
} | null;

export type HomeAttentionActionType = 'route' | 'confirm_pre_visit' | 'confirm_post_visit';

export interface HomeAttentionItem {
  id: string;
  label: string;
  description?: string;
  actionLabel: string;
  actionType: HomeAttentionActionType;
  route?: string;
  bookingId?: number;
}

export interface SetupAttentionSource {
  id: string;
  title: string;
  route: string;
}

const COMPACT_SETUP_IDS = new Set(['photo', 'city', 'services', 'schedule', 'full_name']);

const SETUP_OVERRIDES: Record<string, Pick<HomeAttentionItem, 'label' | 'description' | 'actionLabel'>> = {
  photo: {
    label: 'Заполните профиль',
    description: 'Добавьте фото профиля',
    actionLabel: 'Настройки',
  },
  full_name: {
    label: 'Заполните профиль',
    description: 'Укажите ФИО',
    actionLabel: 'Настройки',
  },
  city: {
    label: 'Укажите город',
    description: 'Город виден клиентам на странице записи',
    actionLabel: 'Настройки',
  },
  services: {
    label: 'Добавьте услуги',
    description: 'Без услуг клиенты не смогут записаться',
    actionLabel: 'Услуги',
  },
  schedule: {
    label: 'Настройте расписание',
    description: 'Нет доступных слотов для записи',
    actionLabel: 'Расписание',
  },
};

function bookingDescription(booking: Booking): string {
  const client =
    (booking.client_master_alias ?? '').trim() ||
    (booking.client_account_name ?? booking.client_name ?? '').trim() ||
    'Клиент';
  const service = (booking.service_name ?? 'Услуга').trim();
  return `${client} · ${service}`;
}

function isFuturePendingStatus(status: string | undefined | null): boolean {
  const s = String(status || '').toLowerCase();
  return s === 'created' || s === 'awaiting_confirmation';
}

function isAwaitingPayment(status: string | undefined | null): boolean {
  return String(status || '').toLowerCase() === 'awaiting_payment';
}

export function buildBookingAttentionItems(params: {
  futureBookings: Booking[];
  pastBookings: Booking[];
  master: MasterAttentionLike;
  hasExtendedStats?: boolean;
  now?: Date;
}): HomeAttentionItem[] {
  const { futureBookings, pastBookings, master, hasExtendedStats = false, now = new Date() } = params;
  const items: HomeAttentionItem[] = [];
  const seenBookingIds = new Set<number>();

  for (const booking of futureBookings) {
    if (seenBookingIds.has(booking.id)) continue;

    if (canPreVisitConfirmBooking(booking, master, now, hasExtendedStats)) {
      items.push({
        id: `pre_visit_${booking.id}`,
        label: 'Клиент ждёт подтверждения визита',
        description: bookingDescription(booking),
        actionLabel: 'Подтвердить',
        actionType: 'confirm_pre_visit',
        bookingId: booking.id,
      });
      seenBookingIds.add(booking.id);
      continue;
    }

    if (isAwaitingPayment(booking.status)) {
      items.push({
        id: `payment_${booking.id}`,
        label: 'Ожидается оплата',
        description: bookingDescription(booking),
        actionLabel: 'Открыть',
        actionType: 'route',
        route: '/master/schedule',
      });
      seenBookingIds.add(booking.id);
      continue;
    }

    if (isFuturePendingStatus(booking.status)) {
      items.push({
        id: `pending_${booking.id}`,
        label: 'Запись ожидает подтверждения',
        description: bookingDescription(booking),
        actionLabel: 'Открыть',
        actionType: 'route',
        route: '/master/schedule',
      });
      seenBookingIds.add(booking.id);
    }
  }

  for (const booking of pastBookings) {
    if (!canConfirmPostVisit(booking, master, now)) continue;
    items.push({
      id: `post_visit_${booking.id}`,
      label: 'Подтвердите результат визита',
      description: bookingDescription(booking),
      actionLabel: 'Подтвердить',
      actionType: 'confirm_post_visit',
      bookingId: booking.id,
    });
  }

  return items;
}

export function buildSetupAttentionItems(setupSources: SetupAttentionSource[]): HomeAttentionItem[] {
  const items: HomeAttentionItem[] = [];
  const profileAdded = new Set<string>();

  for (const source of setupSources) {
    if (!COMPACT_SETUP_IDS.has(source.id)) continue;

    const override = SETUP_OVERRIDES[source.id];
    if (!override) continue;

    if ((source.id === 'photo' || source.id === 'full_name') && profileAdded.has('profile')) {
      continue;
    }
    if (source.id === 'photo' || source.id === 'full_name') {
      profileAdded.add('profile');
    }

    items.push({
      id: `setup_${source.id}`,
      label: override.label,
      description: override.description,
      actionLabel: override.actionLabel,
      actionType: 'route',
      route: source.route,
    });
  }

  return items;
}

export function buildHomeAttentionItems(params: {
  futureBookings: Booking[];
  pastBookings: Booking[];
  master: MasterAttentionLike;
  setupSources: SetupAttentionSource[];
  hasExtendedStats?: boolean;
  now?: Date;
}): HomeAttentionItem[] {
  return [
    ...buildBookingAttentionItems(params),
    ...buildSetupAttentionItems(params.setupSources),
  ];
}
