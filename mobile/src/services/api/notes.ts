import { apiClient } from './client';

export interface ClientNote {
  id: string; // Формат: "master_{id}" или "salon_{id}"
  type: 'master' | 'salon';
  master_id?: number;
  salon_id?: number;
  branch_id?: number | null;
  note: string;
  created_at: string;
  updated_at: string;
  master_name?: string | null;
  salon_name?: string | null;
  branch_name?: string | null;
}

export interface ClientMasterNote {
  id: number;
  master_id: number;
  salon_id?: number | null;
  note: string;
  created_at: string;
  updated_at: string;
  master_name?: string | null;
  salon_name?: string | null;
}

export interface ClientSalonNote {
  id: number;
  salon_id: number;
  branch_id?: number | null;
  note: string;
  created_at: string;
  updated_at: string;
  salon_name?: string | null;
  branch_name?: string | null;
}

export interface CreateMasterNoteData {
  master_id: number;
  salon_id?: number | null;
  note: string;
}

export interface CreateSalonNoteData {
  salon_id: number;
  branch_id?: number | null;
  note: string;
}

/**
 * Получить все заметки клиента (о мастерах и салонах)
 */
export async function getAllNotes(): Promise<ClientNote[]> {
  const response = await apiClient.get<ClientNote[]>('/api/client/all-notes');
  return response.data;
}

/**
 * Получить заметку о мастере.
 * Backend: GET /api/client/master-notes/{master_id}.
 * При 404 (заметка ещё не создана) возвращает null, не бросает — это нормальный empty state.
 */
export async function getMasterNote(masterId: number): Promise<ClientMasterNote | null> {
  try {
    const response = await apiClient.get<ClientMasterNote>(`/api/client/master-notes/${masterId}`);
    return response.data;
  } catch (err: unknown) {
    const ax = err as { response?: { status?: number; data?: { detail?: string } } };
    if (ax.response?.status === 404 || (ax.response?.data?.detail && String(ax.response.data.detail).toLowerCase().includes('заметка не найдена'))) {
      return null;
    }
    throw err;
  }
}

/**
 * Создать или обновить заметку о мастере.
 * Backend: POST /api/client/master-notes
 */
export async function createOrUpdateMasterNote(data: CreateMasterNoteData): Promise<ClientMasterNote> {
  const response = await apiClient.post<ClientMasterNote>('/api/client/master-notes', data);
  return response.data;
}

/**
 * Удалить заметку о мастере.
 * Backend: DELETE /api/client/master-notes/{master_id}
 */
export async function deleteMasterNote(masterId: number): Promise<void> {
  await apiClient.delete(`/api/client/master-notes/${masterId}`);
}

/**
 * Получить заметку о салоне. Использовать только при salons_enabled.
 * Backend: GET /api/client/salon-notes/{salon_id}.
 * При 404 (заметка ещё не создана) возвращает null, не бросает — это нормальный empty state.
 */
export async function getSalonNote(salonId: number, branchId?: number | null): Promise<ClientSalonNote | null> {
  try {
    let url = `/api/client/salon-notes/${salonId}`;
    if (branchId) {
      url += `?branch_id=${branchId}`;
    }
    const response = await apiClient.get<ClientSalonNote>(url);
    return response.data;
  } catch (err: unknown) {
    const ax = err as { response?: { status?: number; data?: { detail?: string } } };
    if (ax.response?.status === 404 || (ax.response?.data?.detail && String(ax.response.data.detail).toLowerCase().includes('заметка не найдена'))) {
      return null;
    }
    throw err;
  }
}

/**
 * Создать или обновить заметку о салоне. Использовать только при salons_enabled.
 * Backend: POST /api/client/salon-notes
 */
export async function createOrUpdateSalonNote(data: CreateSalonNoteData): Promise<ClientSalonNote> {
  const response = await apiClient.post<ClientSalonNote>('/api/client/salon-notes', data);
  return response.data;
}

/**
 * Удалить заметку о салоне. Использовать только при salons_enabled.
 * Backend: DELETE /api/client/salon-notes/{salon_id}
 */
export async function deleteSalonNote(salonId: number, branchId?: number | null): Promise<void> {
  let url = `/api/client/salon-notes/${salonId}`;
  if (branchId) {
    url += `?branch_id=${branchId}`;
  }
  await apiClient.delete(url);
}

