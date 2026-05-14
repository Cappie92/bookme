/**
 * Публичный API записи к мастеру: /api/public/masters/{slug}
 * Один источник правды — те же данные, что в ЛК мастера.
 */
import { apiClient } from './client';

export interface PublicService {
  id: number;
  name: string;
  duration: number;
  price: number;
  category_name: string | null;
}

/** Публичные подсказки лояльности (как в GET /api/public/masters/{slug}). */
export interface PublicHappyHoursVisual {
  weekday: number;
  start_time: string;
  end_time: string;
  discount_percent: number;
  label: string;
}

export interface PublicServiceDiscountVisual {
  master_service_id: number;
  discount_percent: number;
  label: string;
}

export interface PublicLoyaltyVisual {
  happy_hours: PublicHappyHoursVisual[];
  service_discounts: PublicServiceDiscountVisual[];
}

export interface PublicMasterProfile {
  master_id: number;
  master_name: string;
  master_slug: string;
  master_timezone: string;
  description: string | null;
  avatar_url: string | null;
  city: string | null;
  address: string | null;
  address_detail: string | null;
  phone: string | null;
  yandex_maps_url: string | null;
  services: PublicService[];
  requires_advance_payment: boolean;
  booking_blocked: boolean;
  loyalty_visual?: PublicLoyaltyVisual;
}

export interface PublicSlot {
  start_time: string; // ISO
  end_time: string;
}

export interface PublicAvailability {
  slots: PublicSlot[];
  master_timezone: string;
}

export interface LoyaltyHint {
  active: boolean;
  condition_type?: string | null;
  discount_percent?: number | null;
  rule_name?: string | null;
}

export interface PublicEligibility {
  booking_blocked: boolean;
  requires_advance_payment: boolean;
  points: number | null;
  loyalty_hint?: LoyaltyHint | null;
}

export interface BookingPricePreview {
  base_price: number;
  discount_percent?: number | null;
  discount_amount: number;
  final_price: number;
  rule_name?: string | null;
  condition_type?: string | null;
}

export interface ClientNoteResponse {
  note_text: string | null;
}

export interface CreatePublicBookingResponse {
  id: number;
  status: string;
  public_reference: string;
  start_time?: string;
  end_time?: string;
  service_name?: string | null;
  base_price?: number | null;
  discount_percent?: number | null;
  discount_amount?: number;
  final_price?: number | null;
  rule_name?: string | null;
  condition_type?: string | null;
}

export async function getPublicMaster(slug: string): Promise<PublicMasterProfile> {
  const response = await apiClient.get<PublicMasterProfile>(`/api/public/masters/${encodeURIComponent(slug)}`);
  return response.data;
}

export async function getPublicMasterAvailability(
  slug: string,
  serviceId: number,
  fromDate: string,
  toDate: string
): Promise<PublicAvailability> {
  const response = await apiClient.get<PublicAvailability>(
    `/api/public/masters/${encodeURIComponent(slug)}/availability`,
    { params: { service_id: serviceId, from_date: fromDate, to_date: toDate } }
  );
  return response.data;
}

export async function getClientNoteForMaster(slug: string): Promise<ClientNoteResponse> {
  const response = await apiClient.get<ClientNoteResponse>(
    `/api/public/masters/${encodeURIComponent(slug)}/client-note`
  );
  return response.data;
}

export async function getPublicEligibility(slug: string): Promise<PublicEligibility> {
  const response = await apiClient.get<PublicEligibility>(
    `/api/public/masters/${encodeURIComponent(slug)}/eligibility`
  );
  return response.data;
}

export async function getPublicBookingPricePreview(
  slug: string,
  serviceId: number,
  startTimeIso: string
): Promise<BookingPricePreview> {
  const response = await apiClient.get<BookingPricePreview>(
    `/api/public/masters/${encodeURIComponent(slug)}/booking-price-preview`,
    {
      params: {
        service_id: serviceId,
        start_time: startTimeIso,
      },
    }
  );
  return response.data;
}

export async function createPublicBooking(
  slug: string,
  payload: { service_id: number; start_time: string; end_time: string }
): Promise<CreatePublicBookingResponse> {
  const response = await apiClient.post<CreatePublicBookingResponse>(
    `/api/public/masters/${encodeURIComponent(slug)}/bookings`,
    payload
  );
  return response.data;
}
