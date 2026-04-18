export const mockBookings = [
  {
    id: 1,
    service_name: 'Стрижка',
    master_name: 'Иван Иванов',
    salon_name: 'Салон красоты',
    start_time: '2025-12-25T16:00:00Z',
    end_time: '2025-12-25T16:30:00Z',
    status: 'created',
    service_duration: 30,
    payment_amount: 1000,
    is_paid: false,
    master_id: 1,
    salon_id: 1,
    master_domain: 'ivan-ivanov',
  },
  {
    id: 2,
    service_name: 'Окрашивание',
    master_name: 'Мария Петрова',
    start_time: '2025-12-20T14:00:00Z',
    end_time: '2025-12-20T16:00:00Z',
    status: 'completed',
    service_duration: 120,
    payment_amount: 3000,
    is_paid: true,
    master_id: 2,
    master_domain: 'maria-petrova',
  },
];

export const mockFavorites = [
  {
    id: 1,
    type: 'master' as const,
    master_id: 1,
    favorite_name: 'Иван Иванов',
    created_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 2,
    type: 'salon' as const,
    salon_id: 1,
    favorite_name: 'Салон красоты',
    created_at: '2025-01-02T00:00:00Z',
  },
];

export const mockNotes = [
  {
    id: 'master_1',
    type: 'master' as const,
    master_id: 1,
    master_name: 'Иван Иванов',
    note: 'Отличный мастер, всегда делает качественно',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
];
