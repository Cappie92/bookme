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
}

export interface PublicSlot {
  start_time: string; // ISO
  end_time: string;
}

export interface PublicAvailability {
  slots: PublicSlot[];
  master_timezone: string;
}

export interface PublicEligibility {
  booking_blocked: boolean;
  requires_advance_payment: boolean;
  points: number | null;
}

export interface ClientNoteResponse {
  note_text: string | null;
}

export interface CreatePublicBookingResponse {
  id: number;
  status: string;
  public_reference: string;
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
