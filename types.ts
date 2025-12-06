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
  activeNotes: number[]; 
  activeEffects: string[]; 
}

export interface AudioSettings {
  volume: number;
  reverb: number;
}

export interface NotePayload {
  noteIndex: number;
  velocity: number;  
  duration?: number;  
  timestamp: number; 
}

// Added SYNC_SCALE to the list
export type MessageType = 'JOIN' | 'LEAVE' | 'NOTE_ON' | 'NOTE_OFF' | 'EFFECT_CHANGE' | 'SYNC_THEME' | 'SYNC_SCALE';

export interface SignalMessage {
  type: MessageType;
  roomId: string;
  payload: any;
  senderId: string;
  timestamp?: number;
}
