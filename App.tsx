import React, { useState, useEffect, useCallback, useRef } from 'react';
import MandalaCanvas from './components/MandalaCanvas';
import Controls from './components/Controls';
import Lobby from './components/Lobby';
import { Theme, UserState, SignalMessage, NotePayload } from './types';
import { audioEngine, CHORD_MODES } from './services/audioEngine';
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

const NOTE_KEYS: Record<string, number> = {
  's': 0, 'd': 1, 'f': 2, 'g': 3, 'h': 4, 'j': 5, 'k': 6,
  'e': 7, 'r': 8, 't': 9, 'y': 10, 'u': 11, 'i': 12, 'o': 13
};

const EFFECT_KEYS: Record<string, string> = {
  'c': 'vibrato',
  'v': 'reverb_max', 
  'z': 'filter_close',
  'x': 'distort'
};

const MAX_POLYPHONY = 5;

const App: React.FC = () => {
  const [isInLobby, setIsInLobby] = useState(true);
  const [localUser, setLocalUser] = useState<UserState | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<UserState[]>([]);
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [isGenerating, setIsGenerating] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  
  const localIdRef = useRef<string | null>(null);
  
  const [activeChordMode, setActiveChordMode] = useState<string>('Single');
  const [overrideScale, setOverrideScale] = useState<string>('');

  const allUsers = localUser ? [localUser, ...remoteUsers] : [];
  const effectiveScale = overrideScale || theme.scale;

  useEffect(() => {
    if (localUser) localIdRef.current = localUser.id;
  }, [localUser]);

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
        
        // Find the remote user to get their active effects
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
        // PASS REMOTE EFFECTS HERE
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
        
        // Update audio engine live for this remote user
        audioEngine.updateUserEffects(msg.senderId, updatedEffects);
        break;
      }

      case 'SYNC_THEME': 
        setTheme(msg.payload);
        setOverrideScale(''); // Reset override when theme changes
        break;

      // NEW: Sync Scale globally
      case 'SYNC_SCALE':
        setOverrideScale(msg.payload);
        break;
    }
  }, [theme, effectiveScale, remoteUsers]);

  const joinRoom = (name: string, code: string) => {
    const newUser: UserState = {
      id: Math.random().toString(36).substr(2, 9),
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

    comms.connect(code, handleRemoteMessage);
    setTimeout(() => {
        comms.send('JOIN', newUser, newUser.id);
    }, 500);
  };

  useEffect(() => {
    if (isInLobby || !localUser) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if ((e.target as HTMLElement).tagName === 'SELECT') return;

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
            // Pass local effects
            audioEngine.noteOn(localUser.id, noteIndex, freq, theme.synthConfig, localUser.activeEffects);

            const notePayload: NotePayload = {
              noteIndex,
              velocity: 0.8, 
              timestamp: Date.now(),
              duration: 0 
            };
            comms.sendNote(notePayload, localUser.id);
        });
      }

      if (EFFECT_KEYS.hasOwnProperty(key)) {
        const effect = EFFECT_KEYS[key];
        let newEffects = localUser.activeEffects;

        if (effect === 'reverb_max') {
            const isActive = localUser.activeEffects.includes('reverb_max');
            const newState = !isActive;
            
            newEffects = newState 
                ? [...localUser.activeEffects, effect]
                : localUser.activeEffects.filter(e => e !== effect);
                
            setLocalUser({ ...localUser, activeEffects: newEffects });
            comms.send('EFFECT_CHANGE', { effect, active: newState }, localUser.id);
        } 
        else {
            if (!localUser.activeEffects.includes(effect)) {
                newEffects = [...localUser.activeEffects, effect];
                setLocalUser({ ...localUser, activeEffects: newEffects });
                comms.send('EFFECT_CHANGE', { effect, active: true }, localUser.id);
            }
        }
        // Update local audio engine live
        audioEngine.updateUserEffects(localUser.id, newEffects);
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
            if (effect === 'reverb_max') return; 

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


  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    setOverrideScale(''); 
    if (localUser) {
        comms.send('SYNC_THEME', newTheme, localUser.id);
    }
  };
  
  // NEW: Handle scale broadcast
  const handleScaleChange = (newScale: string) => {
      setOverrideScale(newScale);
      if (localUser) {
          comms.send('SYNC_SCALE', newScale, localUser.id);
      }
  };

  if (isInLobby) {
    return <Lobby onJoin={joinRoom} />;
  }

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
        setOverrideScale={handleScaleChange} // Pass the broadcast handler
      />

      <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none">
         <div className="flex gap-8 items-center bg-black/40 backdrop-blur px-6 py-2 rounded-full border border-white/5">
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
