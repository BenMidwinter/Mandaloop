export interface SynthConfig {
  osc1Type: 'sine' | 'square' | 'sawtooth' | 'triangle';
  osc2Type: 'sine' | 'square' | 'sawtooth' | 'triangle';
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  filterFreq: number;
  filterQ: number;
  vibratoSpeed: number;
  vibratoDepth: number;
}

export interface Theme {
  name: string;
  colors: string[];
  scale: string; 
  synthConfig: SynthConfig;
  baseFreq: number;
  moodDescription: string;
}

export interface UserState {
  id: string;
  name: string;
  colorIndex: number;
  activeNotes: number[]; // Array of scale degrees currently held (0-13)
  activeEffects: string[]; // ['vibrato', 'filter_low', 'reverb_max', etc]
}

export interface AudioSettings {
  volume: number;
  reverb: number;
}

export interface NotePayload {
  noteIndex: number;
  velocity: number;   // 0.0 - 1.0
  duration?: number;  // Optional: estimated duration if known
  timestamp: number;  // Event time
}

// Comms / Event Types
export type MessageType = 'JOIN' | 'LEAVE' | 'NOTE_ON' | 'NOTE_OFF' | 'EFFECT_CHANGE' | 'SYNC_THEME';

export interface SignalMessage {
  type: MessageType;
  roomId: string;
  payload: any;
  senderId: string;
  timestamp?: number;
}