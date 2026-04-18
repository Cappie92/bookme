import {
  getAllNotes,
  getMasterNote,
  createOrUpdateMasterNote,
  deleteMasterNote,
  getSalonNote,
  createOrUpdateSalonNote,
  deleteSalonNote,
} from '@src/services/api/notes';
import { apiClient } from "@src/services/api/client";
import { mockNotes } from '../../../../test-utils/helpers/test-data';

describe('Notes API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllNotes', () => {
    it('should get all notes', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockNotes });

      const result = await getAllNotes();

      expect(apiClient.get).toHaveBeenCalledWith('/api/client/all-notes');
      expect(result).toEqual(mockNotes);
    });
  });

  describe('getMasterNote', () => {
    it('should get master note', async () => {
      const mockNote = {
        id: 1,
        master_id: 1,
        salon_id: null,
        note: 'Test note',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        master_name: 'Test Master',
      };
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockNote });

      const result = await getMasterNote(1);

      expect(apiClient.get).toHaveBeenCalledWith('/api/client/master-notes/1');
      expect(result).toEqual(mockNote);
    });

    it('should return null on 404 (note not created yet)', async () => {
      (apiClient.get as jest.Mock).mockRejectedValue({ response: { status: 404, data: { detail: 'Заметка не найдена' } } });

      const result = await getMasterNote(1);

      expect(result).toBeNull();
    });
  });

  describe('createOrUpdateMasterNote', () => {
    it('should create or update master note', async () => {
      const noteData = {
        master_id: 1,
        salon_id: null,
        note: 'Test note',
      };
      const mockResponse = {
        id: 1,
        ...noteData,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      (apiClient.post as jest.Mock).mockResolvedValue({ data: mockResponse });

      const result = await createOrUpdateMasterNote(noteData);

      expect(apiClient.post).toHaveBeenCalledWith('/api/client/master-notes', noteData);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('deleteMasterNote', () => {
    it('should delete master note', async () => {
      (apiClient.delete as jest.Mock).mockResolvedValue({ data: {} });

      await deleteMasterNote(1);

      expect(apiClient.delete).toHaveBeenCalledWith('/api/client/master-notes/1');
    });
  });

  describe('getSalonNote', () => {
    it('should get salon note without branch', async () => {
      const mockNote = {
        id: 1,
        salon_id: 1,
        branch_id: null,
        note: 'Test note',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        salon_name: 'Test Salon',
      };
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockNote });

      const result = await getSalonNote(1);

      expect(apiClient.get).toHaveBeenCalledWith('/api/client/salon-notes/1');
      expect(result).toEqual(mockNote);
    });

    it('should get salon note with branch', async () => {
      const mockNote = {
        id: 1,
        salon_id: 1,
        branch_id: 1,
        note: 'Test note',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        salon_name: 'Test Salon',
        branch_name: 'Test Branch',
      };
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockNote });

      const result = await getSalonNote(1, 1);

      expect(apiClient.get).toHaveBeenCalledWith('/api/client/salon-notes/1?branch_id=1');
      expect(result).toEqual(mockNote);
    });

    it('should return null on 404 (note not created yet)', async () => {
      (apiClient.get as jest.Mock).mockRejectedValue({ response: { status: 404, data: { detail: 'Заметка не найдена' } } });

      const result = await getSalonNote(1);

      expect(result).toBeNull();
    });
  });

  describe('createOrUpdateSalonNote', () => {
    it('should create or update salon note', async () => {
      const noteData = {
        salon_id: 1,
        branch_id: null,
        note: 'Test note',
      };
      const mockResponse = {
        id: 1,
        ...noteData,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      (apiClient.post as jest.Mock).mockResolvedValue({ data: mockResponse });

      const result = await createOrUpdateSalonNote(noteData);

      expect(apiClient.post).toHaveBeenCalledWith('/api/client/salon-notes', noteData);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('deleteSalonNote', () => {
    it('should delete salon note without branch', async () => {
      (apiClient.delete as jest.Mock).mockResolvedValue({ data: {} });

      await deleteSalonNote(1);

      expect(apiClient.delete).toHaveBeenCalledWith('/api/client/salon-notes/1');
    });

    it('should delete salon note with branch', async () => {
      (apiClient.delete as jest.Mock).mockResolvedValue({ data: {} });

      await deleteSalonNote(1, 1);

      expect(apiClient.delete).toHaveBeenCalledWith('/api/client/salon-notes/1?branch_id=1');
    });
  });
});

