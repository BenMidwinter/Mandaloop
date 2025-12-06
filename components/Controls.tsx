// ... (Imports stay same) ...
import React, { useState } from 'react';
import { Theme, SynthConfig } from '../types';
import { generateTheme } from '../services/geminiService';
import { SCALES, CHORD_MODES } from '../services/audioEngine';

// ... (Interface stays same) ...
interface ControlsProps {
  userCount: number;
  onAddUser: () => void;
  onRemoveUser: () => void;
  onThemeChange: (theme: Theme) => void;
  currentTheme: Theme;
  isGenerating: boolean;
  setIsGenerating: (v: boolean) => void;
  roomCode: string;
  setRoomCode: (code: string) => void;
  activeChordMode: string;
  setActiveChordMode: (mode: string) => void;
  overrideScale: string;
  setOverrideScale: (scale: string) => void;
}

const Controls: React.FC<ControlsProps> = ({
  userCount,
  onThemeChange,
  currentTheme,
  isGenerating,
  setIsGenerating,
  roomCode,
  activeChordMode,
  setActiveChordMode,
  overrideScale,
  setOverrideScale
}) => {
  const [prompt, setPrompt] = useState('');
  const [isOpen, setIsOpen] = useState(false); 
  const [showSynth, setShowSynth] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalPrompt = prompt.trim() || roomCode || "Cosmic Geometry";

    setIsGenerating(true);
    try {
      const newTheme = await generateTheme(finalPrompt, roomCode);
      onThemeChange(newTheme);
      setShowSynth(true); 
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
      if (prompt) setPrompt('');
    }
  };

  const handleSynthChange = (key: keyof SynthConfig, value: number) => {
      const updatedTheme = {
          ...currentTheme,
          synthConfig: {
              ...currentTheme.synthConfig,
              [key]: value
          }
      };
      onThemeChange(updatedTheme);
  };

  // NEW: Handle Root Note (Base Freq) Change
  const handleBaseFreqChange = (value: number) => {
      const updatedTheme = {
          ...currentTheme,
          baseFreq: value
      };
      onThemeChange(updatedTheme);
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed top-4 right-4 z-20 bg-white/5 backdrop-blur-md p-3 rounded-full hover:bg-white/20 transition-all border border-white/10"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1.29 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
      </button>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-20 w-80 bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl p-6 shadow-2xl text-sm font-light max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-medium tracking-widest bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">MANDALOOP</h2>
        <button onClick={() => setIsOpen(false)} className="text-white/70 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <div className="mb-6 pb-4 border-b border-white/10">
        <div className="flex justify-between items-center text-white/70 mb-1">
            <span className="text-xs uppercase tracking-wider">Connected Room</span>
            <span className="font-mono text-xs text-green-400">● LIVE</span>
        </div>
        <div className="font-mono text-2xl text-white tracking-widest">{roomCode}</div>
        <div className="text-[10px] text-white/50 mt-1">Users in room: {userCount}</div>
      </div>

      <div className="mb-6 pb-4 border-b border-white/10 space-y-4">
         <h3 className="text-xs uppercase tracking-wider text-white/50">Instrument Config</h3>
         
         <div>
            <label className="block text-[10px] text-white/70 mb-1">CHORD MODE</label>
            <select 
                value={activeChordMode} 
                onChange={(e) => setActiveChordMode(e.target.value)}
                className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:bg-white/20"
            >
                {Object.keys(CHORD_MODES).map(mode => (
                    <option key={mode} value={mode} className="bg-black text-white">{mode}</option>
                ))}
            </select>
         </div>

         <div>
            <label className="block text-[10px] text-white/70 mb-1">SCALE OVERRIDE</label>
            <select 
                value={overrideScale} 
                onChange={(e) => setOverrideScale(e.target.value)}
                className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:bg-white/20"
            >
                <option value="" className="bg-black text-gray-400">Auto (AI Theme)</option>
                {Object.keys(SCALES).map(scale => (
                    <option key={scale} value={scale} className="bg-black text-white">{scale.replace('_', ' ').toUpperCase()}</option>
                ))}
            </select>
         </div>
      </div>

      <div className="mb-6">
        <label className="block text-white/50 mb-2 text-xs uppercase tracking-wider">Generate New Vibe</label>
        <form onSubmit={handleGenerate} className="flex gap-2">
            <input 
                type="text" 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe atmosphere..."
                className="w-full bg-white/10 border border-white/10 rounded px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 transition-colors"
            />
            <button 
                type="submit" 
                disabled={isGenerating}
                className="bg-purple-600/80 hover:bg-purple-500 disabled:bg-purple-900/50 text-white rounded px-3 py-2 transition-colors flex items-center justify-center"
            >
                {isGenerating ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg>
                )}
            </button>
        </form>
      </div>

      <div className="mb-4">
         <button 
            onClick={() => setShowSynth(!showSynth)}
            className="w-full flex justify-between items-center text-xs uppercase tracking-wider text-white/50 hover:text-white transition-colors"
         >
             <span>Fine Tune Sound</span>
             <span>{showSynth ? '−' : '+'}</span>
         </button>
         
         {showSynth && (
             <div className="mt-4 space-y-4 p-4 bg-black/40 rounded border border-white/5">
                 
                 {/* NEW: Root Note (Base Freq) */}
                 <div>
                     <div className="flex justify-between text-[10px] text-white/70 mb-1">
                         <span>BASE PITCH (ROOT)</span>
                         <span>{Math.round(currentTheme.baseFreq)}Hz</span>
                     </div>
                     <input 
                         type="range" min="50" max="400" step="5"
                         value={currentTheme.baseFreq}
                         onChange={(e) => handleBaseFreqChange(parseFloat(e.target.value))}
                         className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-green-500"
                     />
                 </div>

                 {/* Attack / Release */}
                 <div className="space-y-3">
                     <div>
                         <div className="flex justify-between text-[10px] text-white/70 mb-1">
                             <span>ATTACK</span>
                             <span>{currentTheme.synthConfig.attack}s</span>
                         </div>
                         <input 
                             type="range" min="0.01" max="2.0" step="0.01"
                             value={currentTheme.synthConfig.attack}
                             onChange={(e) => handleSynthChange('attack', parseFloat(e.target.value))}
                             className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-purple-500"
                         />
                     </div>
                     <div>
                         <div className="flex justify-between text-[10px] text-white/70 mb-1">
                             <span>RELEASE</span>
                             <span>{currentTheme.synthConfig.release}s</span>
                         </div>
                         <input 
                             type="range" min="0.1" max="5.0" step="0.1"
                             value={currentTheme.synthConfig.release}
                             onChange={(e) => handleSynthChange('release', parseFloat(e.target.value))}
                             className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-purple-500"
                         />
                     </div>
                 </div>

                 {/* Filter */}
                 <div>
                     <div className="flex justify-between text-[10px] text-white/70 mb-1">
                         <span>BRIGHTNESS (FILTER)</span>
                         <span>{currentTheme.synthConfig.filterFreq}Hz</span>
                     </div>
                     <input 
                         type="range" min="200" max="5000" step="50"
                         value={currentTheme.synthConfig.filterFreq}
                         onChange={(e) => handleSynthChange('filterFreq', parseFloat(e.target.value))}
                         className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
                     />
                 </div>

                 {/* Vibrato */}
                 <div>
                     <div className="flex justify-between text-[10px] text-white/70 mb-1">
                         {/* Clarified Label */}
                         <span>VIBRATO INTENSITY (C BUTTON)</span>
                         <span>{currentTheme.synthConfig.vibratoDepth}</span>
                     </div>
                     <input 
                         type="range" min="0" max="30" step="1"
                         value={currentTheme.synthConfig.vibratoDepth}
                         onChange={(e) => handleSynthChange('vibratoDepth', parseFloat(e.target.value))}
                         className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-pink-500"
                     />
                 </div>
             </div>
         )}
      </div>
      
      <div className="mt-4 p-4 bg-white/5 rounded border border-white/5">
           <div className="text-white font-medium mb-1">{currentTheme.name}</div>
           <div className="text-xs text-white/60 italic leading-relaxed">{currentTheme.moodDescription}</div>
           <div className="mt-3 text-[10px] text-white/50 font-mono uppercase">
               Scale: {currentTheme.scale.replace('_', ' ')}
           </div>
      </div>
    </div>
  );
};

export default Controls;
