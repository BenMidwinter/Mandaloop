import React, { useState, useEffect, useCallback, useRef } from 'react';
import MandalaCanvas from './components/MandalaCanvas';
import Controls from './components/Controls';
import Lobby from './components/Lobby';
import { Theme, UserState, SignalMessage, NotePayload } from './types';
import { audioEngine, CHORD_MODES, VALID_SCALES } from './services/audioEngine';
import { comms } from './services/commsService';
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
  'z': 0, 'x': 1, 'c': 2, 'v': 3, 'b': 4, 'n': 5, 'm': 6,
  's': 7, 'd': 8, 'f': 9, 'g': 10, 'h': 11, 'j': 12, 'k': 13,
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  
  const localIdRef = useRef<string | null>(null);
  const messageHandlerRef = useRef<(msg: SignalMessage) => void>(() => {});

  const [activeChordMode, setActiveChordMode] = useState<string>('Single');
  const [overrideScale, setOverrideScale] = useState<string>('');

  // --- LOGGING REFS ---
  const sessionStartTime = useRef<number>(0);
  const sessionLog = useRef<any[]>([]);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const allUsers = localUser ? [localUser, ...remoteUsers] : [];
  const effectiveScale = overrideScale || theme.scale;

  // --- TIME FORMATTER ---
  const formatTimestamp = (ms: number) => {
    const mins = Math.floor(ms / 60000).toString().padStart(2, '0');
    const secs = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
    const millis = (ms % 1000).toString().padStart(3, '0');
    return `${mins}:${secs}:${millis}`;
  };

  // --- LOGGING HELPER ---
  const logEvent = useCallback((userId: string, userName: string, action: string, details: any = {}) => {
      if (sessionStartTime.current === 0) return;
      const currentOffset = Date.now() - sessionStartTime.current;
      sessionLog.current.push({
          time: formatTimestamp(currentOffset), 
          offsetMs: currentOffset,              
          userId,
          userName,
          action,
          ...details
      });
  }, []);

  useEffect(() => {
    if (localUser) localIdRef.current = localUser.id;
  }, [localUser]);

  // --- BACKGROUND LATENCY CHECK ---
  useEffect(() => {
    if (remoteUsers.length === 0 || !localUser) return;

    const interval = setInterval(() => {
        comms.send('PING', { timestamp: Date.now() }, localUser.id);
    }, 15000); 

    return () => clearInterval(interval);
  }, [remoteUsers.length, localUser]);

  const handleThemeChange = (newTheme: Theme) => {
    if (newTheme.name !== theme.name) {
        setOverrideScale(''); 
    }
    
    // 1. Instantly update local state so the audio sweeps smoothly for you
    setTheme(newTheme);

    if (localUser) {
        // 2. Clear any pending logs/syncs if you are still dragging the slider
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

        // 3. Set a new timer. If 500ms passes without another movement, THEN log and sync.
        syncTimeoutRef.current = setTimeout(() => {
            comms.send('SYNC_THEME', newTheme, localUser.id);
            
            // Log the final resting point of the sliders with all internal values
            logEvent(localUser.id, localUser.name, 'THEME_CHANGED', { 
                themeName: newTheme.name, 
                scale: newTheme.scale,
                baseFrequencyHz: newTheme.baseFreq,
                ...newTheme.synthConfig 
            });
        }, 500); 
    }
  };

  const handleGenerate = async (prompt: string) => {
    if (isGenerating) return;
    setIsGenerating(true); 

    try {
      if (localUser) logEvent(localUser.id, localUser.name, 'TRIGGERED_AI_GENERATION', { prompt });
      const newTheme = await generateMandalaTheme(prompt);
      handleThemeChange(newTheme);
    } catch (error) {
      console.error("Theme generation failed:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRemoteMessage = useCallback((msg: SignalMessage) => {
    if (localIdRef.current && msg.senderId === localIdRef.current) return;

    const sender = remoteUsers.find(u => u.id === msg.senderId);
    const senderName = sender ? sender.name : msg.senderId;

    switch (msg.type) {
      case 'PING':
        if (localIdRef.current) {
            comms.send('PONG', { originalTimestamp: msg.payload.timestamp }, localIdRef.current);
        }
        break;

      case 'PONG': {
        const rtt = Date.now() - msg.payload.originalTimestamp;
        const estimatedOneWay = Math.round(rtt / 2);
        logEvent(msg.senderId, senderName, 'LATENCY_MEASURE', { 
            roundTripMs: rtt, 
            estimatedOneWayMs: estimatedOneWay 
        });
        break;
      }

      case 'JOIN': {
        const rawUser = msg.payload as Partial<UserState>;
        logEvent(msg.senderId, rawUser.name || 'Anonymous', 'JOINED_ROOM');
        setRemoteUsers(prev => {
          if (prev.find(u => u.id === msg.senderId)) return prev;
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
      }
      case 'LEAVE': 
        logEvent(msg.senderId, senderName, 'LEFT_ROOM');
        setRemoteUsers(prev => prev.filter(u => u.id !== msg.senderId));
        break;
        
      case 'NOTE_ON': {
        const { noteIndex } = msg.payload as NotePayload;
        const freq = audioEngine.getFreq(theme.baseFreq, effectiveScale, noteIndex);
        
        logEvent(msg.senderId, senderName, 'NOTE_ON', { 
            noteIndex, 
            frequencyHz: Number(freq.toFixed(2)) 
        });
        
        const senderEffects = sender ? sender.activeEffects : [];
        setRemoteUsers(prev => prev.map(u => {
          const currentNotes = u.activeNotes || [];
          if (u.id === msg.senderId && !currentNotes.includes(noteIndex)) {
            return { ...u, activeNotes: [...currentNotes, noteIndex] };
          }
          return u;
        }));
        
        audioEngine.noteOn(msg.senderId, noteIndex, freq, theme.synthConfig, senderEffects);
        break;
      }
      
      case 'NOTE_OFF': {
        const { noteIndex } = msg.payload;
        const freq = audioEngine.getFreq(theme.baseFreq, effectiveScale, noteIndex);

        logEvent(msg.senderId, senderName, 'NOTE_OFF', { 
            noteIndex,
            frequencyHz: Number(freq.toFixed(2))
        });
        
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
        logEvent(msg.senderId, senderName, 'EFFECT_TOGGLED', { effect, active });
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
        // --- NEW: Log the remote user's fine-tuning and theme changes ---
        logEvent(msg.senderId, senderName, 'THEME_CHANGED', { 
            themeName: msg.payload.name, 
            scale: msg.payload.scale,
            baseFrequencyHz: msg.payload.baseFreq,
            ...msg.payload.synthConfig 
        });
        
        setTheme(msg.payload);
        setOverrideScale(''); 
        break;

      case 'SYNC_SCALE':
        // --- NEW: Log the remote user's scale overrides ---
        logEvent(msg.senderId, senderName, 'SCALE_OVERRIDDEN', { scale: msg.payload });
        
        setOverrideScale(msg.payload);
        break;
      }
  }, [theme, effectiveScale, remoteUsers, logEvent]);

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
    
    sessionStartTime.current = Date.now();
    sessionLog.current = [];
    
    logEvent(newUser.id, newUser.name, 'SESSION_START_AND_JOIN', { 
        initialTheme: DEFAULT_THEME.name, 
        initialScale: DEFAULT_THEME.scale,
        baseFrequencyHz: DEFAULT_THEME.baseFreq
    });

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

  const handleExportLog = () => {
    const finalData = {
        sessionDate: new Date().toISOString(),
        roomDurationMs: Date.now() - sessionStartTime.current,
        events: sessionLog.current
    };

    const blob = new Blob([JSON.stringify(finalData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mandaloop-pbmt-log-${new Date().getTime()}.json`;
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleEndSession = () => {
    if (window.confirm("Are you sure you want to end the session? Make sure you have exported the log first.")) {
        window.location.reload(); 
    }
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
            
            logEvent(localUser.id, localUser.name, 'NOTE_ON', { 
                noteIndex, 
                frequencyHz: Number(freq.toFixed(2)) 
            });
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
            
            logEvent(localUser.id, localUser.name, 'EFFECT_TOGGLED', { effect, active: !isActive });
        } 
        else {
            if (!localUser.activeEffects.includes(effect)) {
                const newEffects = [...localUser.activeEffects, effect];
                setLocalUser({ ...localUser, activeEffects: newEffects });
                comms.send('EFFECT_CHANGE', { effect, active: true }, localUser.id);
                audioEngine.updateUserEffects(localUser.id, newEffects);
                
                logEvent(localUser.id, localUser.name, 'EFFECT_TOGGLED', { effect, active: true });
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
                
                const freq = audioEngine.getFreq(theme.baseFreq, effectiveScale, noteIndex);
                audioEngine.noteOff(localUser.id, noteIndex);
                comms.sendNoteOff(noteIndex, localUser.id);
                
                logEvent(localUser.id, localUser.name, 'NOTE_OFF', { 
                    noteIndex,
                    frequencyHz: Number(freq.toFixed(2))
                });
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
            
            logEvent(localUser.id, localUser.name, 'EFFECT_TOGGLED', { effect, active: false });
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isInLobby, localUser, theme, effectiveScale, activeChordMode, logEvent]);

  const handleScaleChange = (newScale: string) => {
      setOverrideScale(newScale);
      if (localUser) {
          comms.send('SYNC_SCALE', newScale, localUser.id);
          logEvent(localUser.id, localUser.name, 'SCALE_OVERRIDDEN', { scale: newScale });
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
        onGenerate={handleGenerate} 
        isGenerating={isGenerating}
        roomCode={roomCode}
        setRoomCode={() => {}} 
        activeChordMode={activeChordMode}
        setActiveChordMode={setActiveChordMode}
        overrideScale={overrideScale}
        setOverrideScale={handleScaleChange}
      />

      <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none">
         <div className="flex gap-8 items-center bg-black/60 backdrop-blur-md px-6 py-3 rounded-xl border border-white/10 shadow-2xl pointer-events-auto">
             <div className="flex flex-col gap-1 border-r border-white/10 pr-6 pointer-events-none">
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

             <div className="flex gap-4 items-center border-r border-white/10 pr-6 pointer-events-none">
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

             <div className="flex gap-2 items-center">
                 <button 
                    onClick={handleExportLog}
                    className="flex flex-col items-center justify-center gap-1 px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg transition-colors group"
                 >
                     <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400 group-hover:text-blue-300"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                     <span className="text-[9px] font-mono tracking-widest text-blue-400 group-hover:text-blue-300">EXPORT</span>
                 </button>
                 
                 <button 
                    onClick={handleEndSession}
                    className="flex flex-col items-center justify-center gap-1 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg transition-colors group"
                 >
                     <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400 group-hover:text-red-300"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg>
                     <span className="text-[9px] font-mono tracking-widest text-red-400 group-hover:text-red-300">END</span>
                 </button>
             </div>
         </div>
      </div>
    </div>
  );
};

export default App;