import type { CreateRecording } from './index';

export interface PatientSlot {
  id: string;
  formData: CreateRecording;
  audioState: 'idle' | 'recording' | 'paused' | 'stopped';
  audioUri: string | null;
  audioDuration: number;
  uploadStatus: 'pending' | 'uploading' | 'success' | 'error';
  uploadProgress: number;
  uploadError: string | null;
  serverRecordingId: string | null;
}

export type SessionAction =
  | { type: 'ADD_SLOT'; defaultTemplateId?: string }
  | { type: 'REMOVE_SLOT'; slotId: string }
  | { type: 'SET_ACTIVE_INDEX'; index: number }
  | { type: 'UPDATE_FORM'; slotId: string; field: keyof CreateRecording; value: string | boolean | undefined }
  | { type: 'SET_AUDIO_STATE'; slotId: string; audioState: PatientSlot['audioState'] }
  | { type: 'SAVE_AUDIO'; slotId: string; audioUri: string; duration: number }
  | { type: 'CLEAR_AUDIO'; slotId: string }
  | { type: 'BIND_RECORDER'; slotId: string }
  | { type: 'UNBIND_RECORDER' }
  | { type: 'SET_UPLOAD_STATUS'; slotId: string; status: PatientSlot['uploadStatus']; progress?: number; error?: string | null; serverRecordingId?: string | null }
  | { type: 'RESET_SESSION'; defaultTemplateId?: string };

export interface SessionState {
  slots: PatientSlot[];
  activeIndex: number;
  recorderBoundToSlotId: string | null;
}
