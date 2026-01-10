import React, { useState, useEffect, useCallback, useRef } from 'react';
import MandalaCanvas from './components/MandalaCanvas';
import Controls from './components/Controls';
import Lobby from './components/Lobby';
import { Theme, UserState, SignalMessage, NotePayload } from './types';
import { audioEngine, CHORD_MODES, VALID_SCALES } from './services/audioEngine';
import { comms } from './services/commsService';
// --- NEW IMPORT ---
import { generateMandalaTheme } from './services/geminiService';

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

const NOTE_KEYS: Record<string, number> = {
  // Octave 1 (Bottom Row) - Low
  'z': 0, 'x': 1, 'c': 2, 'v': 3, 'b': 4, 'n': 5, 'm': 6,
  // Octave 2 (Middle Row) - Mid
  's': 7, 'd': 8, 'f': 9, 'g': 10, 'h': 11, 'j': 12, 'k': 13,
  // Octave 3 (Top Row) - High
  'e': 14, 'r': 15, 't': 16, 'y': 17, 'u': 18, 'i': 19, 'o': 20, 'p': 21
};

const EFFECT_KEYS: Record<string, string> = {
  ';': 'vibrato',
  '\'': 'reverb_max', 
  '[': 'filter_close',
  ']': 'distort'
};

const MAX_POLYPHONY = 24;

const App: React.FC = () => {
  const [isInLobby, setIsInLobby] = useState(true);
  const [localUser, setLocalUser] = useState<UserState | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<UserState[]>([]);
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  
  // --- STATE FOR THE LOCK ---
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [roomCode, setRoomCode] = useState('');
  
  const localIdRef = useRef<string | null>(null);
  const messageHandlerRef = useRef<(msg: SignalMessage) => void>(() => {});

  const [activeChordMode, setActiveChordMode] = useState<string>('Single');
  const [overrideScale, setOverrideScale] = useState<string>('');

  const allUsers = localUser ? [localUser, ...remoteUsers] : [];
  const effectiveScale = overrideScale || theme.scale;

  useEffect(() => {
    if (localUser) localIdRef.current = localUser.id;
  }, [localUser]);

  const handleThemeChange = (newTheme: Theme) => {
    // FIX: Only clear the manual scale if the Theme Name has changed.
    if (newTheme.name !== theme.name) {
        setOverrideScale(''); 
    }
    setTheme(newTheme);
    if (localUser) {
        comms.send('SYNC_THEME', newTheme, localUser.id);
    }
  };

  // --- NEW: THE SAFE GENERATE FUNCTION (The Lock) ---
  const handleGenerate = async (prompt: string) => {
    // 1. THE LOCK: Stop if already running
    if (isGenerating) return;
    
    // 2. Lock the door
    setIsGenerating(true); 

    try {
      const newTheme = await generateMandalaTheme(prompt);
      handleThemeChange(newTheme);
    } catch (error) {
      console.error("Theme generation failed:", error);
    } finally {
      // 3. Unlock the door (Always, even if it fails)
      setIsGenerating(false);
    }
  };

  const handleRemoteMessage = useCallback((msg: SignalMessage) => {
    if (localIdRef.current && msg.senderId === localIdRef.current) return;

    switch (msg.type) {
      case 'JOIN':
        setRemoteUsers(prev => {
          if (prev.find(u => u.id === msg.senderId)) return prev;
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

      case 'LEAVE': 
        setRemoteUsers(prev => prev.filter(u => u.id !== msg.senderId));
        break;
        
      case 'NOTE_ON': {
        const { noteIndex } = msg.payload as NotePayload;
        const sender = remoteUsers.find(u => u.id === msg.senderId);
        const senderEffects = sender ? sender.activeEffects : [];

        setRemoteUsers(prev => prev.map(u => {
          const currentNotes = u.activeNotes || [];
          if (u.id === msg.senderId && !currentNotes.includes(noteIndex)) {
            return { ...u, activeNotes: [...currentNotes, noteIndex] };
          }
          return u;
        }));
        
        const freq = audioEngine.getFreq(theme.baseFreq, effectiveScale, noteIndex);
        audioEngine.noteOn(msg.senderId, noteIndex, freq, theme.synthConfig, senderEffects);
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
        let updatedEffects: string[] = [];

        setRemoteUsers(prev => prev.map(u => {
            if (u.id === msg.senderId) {
                const currentEffects = u.activeEffects || [];
                updatedEffects = active 
                    ? [...currentEffects, effect]
                    : currentEffects.filter(e => e !== effect);
                return { ...u, activeEffects: updatedEffects };
            }
            return u;
        }));
        
        audioEngine.updateUserEffects(msg.senderId, updatedEffects);
        break;
      }

      case 'SYNC_THEME': 
        setTheme(msg.payload);
        setOverrideScale(''); 
        break;

      case 'SYNC_SCALE':
        setOverrideScale(msg.payload);
        break;
    }
  }, [theme, effectiveScale, remoteUsers]);

  useEffect(() => {
    messageHandlerRef.current = handleRemoteMessage;
  }, [handleRemoteMessage]);

  const joinRoom = (name: string, code: string) => {
    let existingId = sessionStorage.getItem('mandaloop_userId');
    if (!existingId) {
        existingId = Math.random().toString(36).substr(2, 9);
        sessionStorage.setItem('mandaloop_userId', existingId);
    }

    const newUser: UserState = {
      id: existingId, 
      name: name,
      colorIndex: Math.floor(Math.random() * 5),
      activeNotes: [],
      activeEffects: []
    };
    
    setLocalUser(newUser);
    localIdRef.current = newUser.id;
    setRoomCode(code);
    setIsInLobby(false);
    
    audioEngine.init();

    comms.connect(code, (msg) => {
        if (messageHandlerRef.current) {
            messageHandlerRef.current(msg);
        }
    });

    setTimeout(() => {
        comms.send('JOIN', newUser, newUser.id);
    }, 500);
  };

  useEffect(() => {
    if (isInLobby || !localUser) return;

    const TOGGLE_EFFECTS = ['reverb_max', 'filter_close', 'distort'];

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      const key = e.key.toLowerCase(); 

      if (NOTE_KEYS.hasOwnProperty(key)) {
        const baseIndex = NOTE_KEYS[key];
        if ((localUser.activeNotes || []).length >= MAX_POLYPHONY) return;

        const intervals = CHORD_MODES[activeChordMode] || [0];
        
        intervals.forEach(interval => {
            const noteIndex = baseIndex + interval;
            setLocalUser(prev => {
                if (!prev) return prev;
                const currentNotes = prev.activeNotes || [];
                if (currentNotes.length >= MAX_POLYPHONY) return prev;
                if (currentNotes.includes(noteIndex)) return prev;
                return { ...prev, activeNotes: [...currentNotes, noteIndex] };
            });

            const freq = audioEngine.getFreq(theme.baseFreq, effectiveScale, noteIndex);
            audioEngine.noteOn(localUser.id, noteIndex, freq, theme.synthConfig, localUser.activeEffects);

            const notePayload: NotePayload = { noteIndex, velocity: 0.8, timestamp: Date.now(), duration: 0 };
            comms.sendNote(notePayload, localUser.id);
        });
      }

      if (EFFECT_KEYS.hasOwnProperty(key)) {
        const effect = EFFECT_KEYS[key];
        const isToggle = TOGGLE_EFFECTS.includes(effect);

        if (isToggle) {
            const isActive = localUser.activeEffects.includes(effect);
            const newEffects = isActive 
                ? localUser.activeEffects.filter(e => e !== effect) 
                : [...localUser.activeEffects, effect];             
                
            setLocalUser({ ...localUser, activeEffects: newEffects });
            comms.send('EFFECT_CHANGE', { effect, active: !isActive }, localUser.id);
            audioEngine.updateUserEffects(localUser.id, newEffects);
        } 
        else {
            if (!localUser.activeEffects.includes(effect)) {
                const newEffects = [...localUser.activeEffects, effect];
                setLocalUser({ ...localUser, activeEffects: newEffects });
                comms.send('EFFECT_CHANGE', { effect, active: true }, localUser.id);
                audioEngine.updateUserEffects(localUser.id, newEffects);
            }
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
            const isToggle = TOGGLE_EFFECTS.includes(effect);

            if (isToggle) return; 

            const newEffects = localUser.activeEffects.filter(eff => eff !== effect);
            setLocalUser(prev => {
                if (!prev) return prev;
                return { ...prev, activeEffects: newEffects };
            });
            audioEngine.updateUserEffects(localUser.id, newEffects);
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

  const handleScaleChange = (newScale: string) => {
      setOverrideScale(newScale);
      if (localUser) {
          comms.send('SYNC_SCALE', newScale, localUser.id);
      }
  };

  if (isInLobby) {
    return <Lobby onJoin={joinRoom} />;
  }

  const activeFx = localUser?.activeEffects || [];
  const hasReverb = activeFx.includes('reverb_max');
  const hasFilter = activeFx.includes('filter_close');
  const hasDistort = activeFx.includes('distort');
  const hasVibrato = activeFx.includes('vibrato'); 

  return (
    <div className="w-full h-screen bg-black overflow-hidden relative selection:bg-none">
      <MandalaCanvas users={allUsers} theme={theme} scaleType={effectiveScale}/>
      
      <Controls 
        userCount={allUsers.length}
        onAddUser={() => {}} 
        onRemoveUser={() => {}} 
        currentTheme={theme}
        onThemeChange={handleThemeChange}
        // --- NEW: Pass the Locked Generate Function ---
        onGenerate={handleGenerate} 
        isGenerating={isGenerating}
        // Removed: setIsGenerating={setIsGenerating} (Controls shouldn't set this directly anymore)
        roomCode={roomCode}
        setRoomCode={() => {}} 
        activeChordMode={activeChordMode}
        setActiveChordMode={setActiveChordMode}
        overrideScale={overrideScale}
        setOverrideScale={handleScaleChange}
      />

      {/* Footer / Key Guide */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none">
         <div className="flex gap-8 items-center bg-black/60 backdrop-blur-md px-6 py-3 rounded-xl border border-white/10 shadow-2xl">
             <div className="flex flex-col gap-1 border-r border-white/10 pr-6">
                <div className="flex gap-1 justify-center">
                    {['E','R','T','Y','U','I','O','P'].map(k => (
                        <span key={k} className="w-6 h-6 border border-white/30 flex items-center justify-center rounded text-[10px] text-white/80 bg-white/5">{k}</span>
                    ))}
                </div>
                <div className="flex gap-1 justify-center ml-2"> 
                    {['S','D','F','G','H','J','K'].map(k => (
                        <span key={k} className="w-6 h-6 border border-white/30 flex items-center justify-center rounded text-[10px] text-white/80 bg-white/5">{k}</span>
                    ))}
                </div>
                <div className="flex gap-1 justify-center ml-4">
                    {['Z','X','C','V','B','N','M'].map(k => (
                        <span key={k} className="w-6 h-6 border border-white/30 flex items-center justify-center rounded text-[10px] text-white/80 bg-white/5">{k}</span>
                    ))}
                </div>
             </div>

             <div className="flex gap-4 items-center">
                <div className="text-[10px] text-white/50 font-mono tracking-widest writing-vertical">FX</div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-1">
                        <span className={`w-6 h-6 border flex items-center justify-center rounded text-[10px] transition-colors ${hasFilter ? 'bg-green-500/20 border-green-500 text-green-400' : 'border-white/30 text-white/80'}`}>[</span>
                        <span className={`text-[9px] ${hasFilter ? 'text-green-400' : 'text-white/60'}`}>FILT</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className={`w-6 h-6 border flex items-center justify-center rounded text-[10px] transition-colors ${hasDistort ? 'bg-green-500/20 border-green-500 text-green-400' : 'border-white/30 text-white/80'}`}>]</span>
                        <span className={`text-[9px] ${hasDistort ? 'text-green-400' : 'text-white/60'}`}>DIST</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className={`w-6 h-6 border flex items-center justify-center rounded text-[10px] transition-colors ${hasVibrato ? 'bg-white/20 border-white text-white' : 'border-white/30 text-white/80'}`}>;</span>
                        <span className="text-[9px] text-white/60">TREM</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className={`w-6 h-6 border flex items-center justify-center rounded text-[10px] transition-colors ${hasReverb ? 'bg-green-500/20 border-green-500 text-green-400' : 'border-white/30 text-white/80'}`}>'</span>
                        <span className={`text-[9px] ${hasReverb ? 'text-green-400' : 'text-white/60'}`}>REV</span>
                    </div>
                </div>
             </div>
         </div>
      </div>
    </div>
  );
};

export default App;