import React, { useState, useEffect, useCallback, useRef } from 'react';
import MandalaCanvas from './components/MandalaCanvas';
import Controls from './components/Controls';
import Lobby from './components/Lobby';
import { Theme, UserState, SignalMessage, NotePayload } from './types';
import { audioEngine } from './services/audioEngine';
import { comms } from './services/commsService';

const DEFAULT_THEME: Theme = {
  name: "Deep Space",
  colors: ["#60A5FA", "#A78BFA", "#F472B6", "#34D399", "#FBBF24", "#F87171", "#818CF8"],
  scale: "pentatonic_minor",
  synthConfig: {
    osc1Type: "sine",
    osc2Type: "triangle",
    attack: 0.1,
    decay: 0.3,
    sustain: 0.5,
    release: 0.8,
    filterFreq: 1200,
    filterQ: 2,
    vibratoSpeed: 6,
    vibratoDepth: 0
  },
  baseFreq: 150.00,
  moodDescription: "A calm, floating sensation."
};

// --- Key Mappings ---
// Octave 1: s, d, f, g, h, j, k
// Octave 2: e, r, t, y, u, i, o
const NOTE_KEYS: Record<string, number> = {
  's': 0, 'd': 1, 'f': 2, 'g': 3, 'h': 4, 'j': 5, 'k': 6,
  'e': 7, 'r': 8, 't': 9, 'y': 10, 'u': 11, 'i': 12, 'o': 13
};

// Effects: 
// C: Vibrato (Hold)
// V: Reverb (Toggle)
// Z: Filter (Hold)
// X: Distortion (Hold)
const EFFECT_KEYS: Record<string, string> = {
  'c': 'vibrato',
  'v': 'reverb_max', 
  'z': 'filter_close',
  'x': 'distort'
};

const MAX_POLYPHONY = 5;

// Intervals for chord modes (scale degrees relative to root)
export const CHORD_MODES: Record<string, number[]> = {
    'Single': [0],
    'Octaves': [0, 7], 
    'Triad (1-3-5)': [0, 2, 4], 
    'Sus4 (1-4-5)': [0, 3, 4],
    'Open 5th (1-5)': [0, 4],
    'Cluster (1-2)': [0, 1]
};

const App: React.FC = () => {
  const [isInLobby, setIsInLobby] = useState(true);
  const [localUser, setLocalUser] = useState<UserState | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<UserState[]>([]);
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [isGenerating, setIsGenerating] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  
  // Instrument Settings
  const [activeChordMode, setActiveChordMode] = useState<string>('Single');
  const [overrideScale, setOverrideScale] = useState<string>('');

  // Combined user list for rendering
  const allUsers = localUser ? [localUser, ...remoteUsers] : [];

  // Determine effective scale
  const effectiveScale = overrideScale || theme.scale;

  // --- Audio / Comms Handlers ---

  const handleRemoteMessage = useCallback((msg: SignalMessage) => {
    // Ignore own messages
    if (localUser && msg.senderId === localUser.id) return;

    switch (msg.type) {
      case 'JOIN':
        setRemoteUsers(prev => {
          if (prev.find(u => u.id === msg.senderId)) return prev;
          // Firebase might strip empty arrays, restore them
          const rawUser = msg.payload as Partial<UserState>;
          const sanitizedUser: UserState = {
              id: rawUser.id || 'unknown',
              name: rawUser.name || 'Anonymous',
              colorIndex: rawUser.colorIndex || 0,
              activeNotes: rawUser.activeNotes || [],
              activeEffects: rawUser.activeEffects || []
          };
          return [...prev, sanitizedUser];
        });
        break;
        
      case 'NOTE_ON': {
        // Extract expressive params
        const { noteIndex } = msg.payload as NotePayload;
        
        // Update Visual State
        setRemoteUsers(prev => prev.map(u => {
          const currentNotes = u.activeNotes || [];
          if (u.id === msg.senderId && !currentNotes.includes(noteIndex)) {
            return { ...u, activeNotes: [...currentNotes, noteIndex] };
          }
          return u;
        }));
        
        // Play remote sound using current theme/scale settings
        const freq = audioEngine.getFreq(theme.baseFreq, effectiveScale, noteIndex);
        audioEngine.noteOn(msg.senderId, noteIndex, freq, theme.synthConfig);
        break;
      }
      
      case 'NOTE_OFF': {
        const { noteIndex } = msg.payload;
        setRemoteUsers(prev => prev.map(u => {
            if (u.id === msg.senderId) {
                const currentNotes = u.activeNotes || [];
                return { ...u, activeNotes: currentNotes.filter(n => n !== noteIndex) };
            }
            return u;
        }));
        audioEngine.noteOff(msg.senderId, noteIndex);
        break;
      }

      case 'EFFECT_CHANGE': {
        const { effect, active } = msg.payload;
        setRemoteUsers(prev => prev.map(u => {
            if (u.id === msg.senderId) {
                const currentEffects = u.activeEffects || [];
                const effects = active 
                    ? [...currentEffects, effect]
                    : currentEffects.filter(e => e !== effect);
                return { ...u, activeEffects: effects };
            }
            return u;
        }));
        break;
      }

      case 'SYNC_THEME': 
        setTheme(msg.payload);
        break;
    }
  }, [localUser, theme, effectiveScale]);

  const joinRoom = (name: string, code: string) => {
    const newUser: UserState = {
      id: Math.random().toString(36).substr(2, 9),
      name: name,
      colorIndex: Math.floor(Math.random() * 5),
      activeNotes: [],
      activeEffects: []
    };
    
    setLocalUser(newUser);
    setRoomCode(code);
    setIsInLobby(false);
    
    audioEngine.init();

    // Connect to room
    comms.connect(code, handleRemoteMessage);
    // Announce self
    setTimeout(() => {
        comms.send('JOIN', newUser, newUser.id);
    }, 500);
  };

  // --- Keyboard Handling ---
  useEffect(() => {
    if (isInLobby || !localUser) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if ((e.target as HTMLElement).tagName === 'SELECT') return;

      const key = e.key.toLowerCase(); 

      // Note Keys
      if (NOTE_KEYS.hasOwnProperty(key)) {
        const baseIndex = NOTE_KEYS[key];

        // Polyphony Check (Safely check length)
        if ((localUser.activeNotes || []).length >= MAX_POLYPHONY) return;

        // Calculate Chord Notes
        const intervals = CHORD_MODES[activeChordMode] || [0];
        
        intervals.forEach(interval => {
            const noteIndex = baseIndex + interval;

            // Trigger State Update
            setLocalUser(prev => {
                if (!prev) return prev;
                const currentNotes = prev.activeNotes || [];
                // Hard polyphony limit check
                if (currentNotes.length >= MAX_POLYPHONY) return prev;
                if (currentNotes.includes(noteIndex)) return prev;
                return { ...prev, activeNotes: [...currentNotes, noteIndex] };
            });

            // Play Sound Locally
            const freq = audioEngine.getFreq(theme.baseFreq, effectiveScale, noteIndex);
            audioEngine.noteOn(localUser.id, noteIndex, freq, theme.synthConfig);

            // Broadcast via Firebase
            const notePayload: NotePayload = {
              noteIndex,
              velocity: 0.8, // Default velocity for keyboard
              timestamp: Date.now(),
              duration: 0 // Sustained until Note Off
            };
            comms.sendNote(notePayload, localUser.id);
        });
      }

      // Effect Keys
      if (EFFECT_KEYS.hasOwnProperty(key)) {
        const effect = EFFECT_KEYS[key];
        
        // REVERB TOGGLE LOGIC
        if (effect === 'reverb_max') {
            // Safely check includes
            const isActive = (localUser.activeEffects || []).includes('reverb_max');
            const newState = !isActive;
            
            setLocalUser(prev => {
                if (!prev) return prev;
                const currentEffects = prev.activeEffects || [];
                const effects = newState 
                    ? [...currentEffects, effect]
                    : currentEffects.filter(e => e !== effect);
                return { ...prev, activeEffects: effects };
            });
            
            audioEngine.setEffect(effect, newState);
            comms.send('EFFECT_CHANGE', { effect, active: newState }, localUser.id);
        } 
        // OTHER EFFECTS (HOLD)
        else {
            setLocalUser(prev => {
                if (!prev) return prev;
                const currentEffects = prev.activeEffects || [];
                if (currentEffects.includes(effect)) return prev;
                return { ...prev, activeEffects: [...currentEffects, effect] };
            });

            audioEngine.setEffect(effect, true);
            comms.send('EFFECT_CHANGE', { effect, active: true }, localUser.id);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();

        if (NOTE_KEYS.hasOwnProperty(key)) {
            const baseIndex = NOTE_KEYS[key];
            const intervals = CHORD_MODES[activeChordMode] || [0];
            
            intervals.forEach(interval => {
                const noteIndex = baseIndex + interval;
                
                setLocalUser(prev => {
                    if (!prev) return prev;
                    const currentNotes = prev.activeNotes || [];
                    return { ...prev, activeNotes: currentNotes.filter(n => n !== noteIndex) };
                });

                audioEngine.noteOff(localUser.id, noteIndex);
                comms.sendNoteOff(noteIndex, localUser.id);
            });
        }

        if (EFFECT_KEYS.hasOwnProperty(key)) {
            const effect = EFFECT_KEYS[key];
            if (effect === 'reverb_max') return; // Toggle handled in keydown

            setLocalUser(prev => {
                if (!prev) return prev;
                const currentEffects = prev.activeEffects || [];
                return { ...prev, activeEffects: currentEffects.filter(eff => eff !== effect) };
            });

            audioEngine.setEffect(effect, false);
            comms.send('EFFECT_CHANGE', { effect, active: false }, localUser.id);
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isInLobby, localUser, theme, effectiveScale, activeChordMode]);


  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    // When AI changes theme, we clear override so they hear the new scale
    setOverrideScale(''); 
    if (localUser) {
        comms.send('SYNC_THEME', newTheme, localUser.id);
    }
  };

  if (isInLobby) {
    return <Lobby onJoin={joinRoom} />;
  }

  // Safe check for render
  const hasReverb = (localUser?.activeEffects || []).includes('reverb_max');

  return (
    <div className="w-full h-screen bg-black overflow-hidden relative selection:bg-none">
      <MandalaCanvas users={allUsers} theme={theme} />
      
      <Controls 
        userCount={allUsers.length}
        onAddUser={() => {}} 
        onRemoveUser={() => {}} 
        currentTheme={theme}
        onThemeChange={handleThemeChange}
        isGenerating={isGenerating}
        setIsGenerating={setIsGenerating}
        roomCode={roomCode}
        setRoomCode={() => {}} 
        activeChordMode={activeChordMode}
        setActiveChordMode={setActiveChordMode}
        overrideScale={overrideScale}
        setOverrideScale={setOverrideScale}
      />

      {/* Footer Key Overlay - Simplified */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none">
         <div className="flex gap-8 items-center bg-black/40 backdrop-blur px-6 py-2 rounded-full border border-white/5">
             {/* Notes */}
             <div className="flex gap-4 items-center border-r border-white/10 pr-6">
                <div className="text-[10px] text-white/50 font-mono tracking-widest">KEYS</div>
                <div className="flex gap-1">
                    {['S','D','F','G','H','J','K'].map(k => (
                        <span key={k} className="w-6 h-6 border border-white/30 flex items-center justify-center rounded text-[10px] text-white/80">{k}</span>
                    ))}
                    <span className="text-white/20 mx-1">|</span>
                    {['E','R','T','Y','U','I','O'].map(k => (
                        <span key={k} className="w-6 h-6 border border-white/30 flex items-center justify-center rounded text-[10px] text-white/80">{k}</span>
                    ))}
                </div>
             </div>

             {/* FX */}
             <div className="flex gap-4 items-center">
                <div className="text-[10px] text-white/50 font-mono tracking-widest">FX</div>
                <div className="flex gap-2">
                    <div className="flex items-center gap-1">
                        <span className="w-6 h-6 border border-white/30 flex items-center justify-center rounded text-[10px] text-white/80">C</span>
                        <span className="text-[9px] text-white/60">VIB</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className={`w-6 h-6 border flex items-center justify-center rounded text-[10px] transition-colors ${hasReverb ? 'bg-green-500/20 border-green-500 text-green-400' : 'border-white/30 text-white/80'}`}>V</span>
                        <span className={`text-[9px] ${hasReverb ? 'text-green-400' : 'text-white/60'}`}>REV</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="w-6 h-6 border border-white/30 flex items-center justify-center rounded text-[10px] text-white/80">Z</span>
                        <span className="text-[9px] text-white/60">FILT</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="w-6 h-6 border border-white/30 flex items-center justify-center rounded text-[10px] text-white/80">X</span>
                        <span className="text-[9px] text-white/60">DIST</span>
                    </div>
                </div>
             </div>
         </div>
      </div>
    </div>
  );
};

export default App;