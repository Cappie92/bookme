/**
 * Типы для публичной записи к мастеру (wizard: service → date → time)
 */
export interface PublicService {
  id: number;
  name: string;
  duration: number;
  price: number;
  category_name: string | null;
}

export interface PublicSlot {
  start_time: string;
  end_time: string;
}

/** Группа услуг по категории */
export interface ServiceCategory {
  name: string;
  services: PublicService[];
}
