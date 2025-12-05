import React, { useState } from 'react';

interface LobbyProps {
  onJoin: (name: string, roomCode: string) => void;
}

const Lobby: React.FC<LobbyProps> = ({ onJoin }) => {
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name && room) {
      onJoin(name, room.toUpperCase());
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#050505] flex items-center justify-center p-4">
      <div className="max-w-md w-full relative">
        <div className="absolute inset-0 bg-purple-500/10 blur-[100px] rounded-full"></div>
        
        <div className="relative z-10 bg-white/5 border border-white/10 p-8 rounded-2xl backdrop-blur-xl shadow-2xl">
          <div className="text-center mb-10">
            <h1 className="text-5xl font-extralight tracking-[0.2em] text-white mb-2 drop-shadow-lg">MANDALOOP</h1>
            <p className="text-white/40 text-sm tracking-widest uppercase">Shared Musical Geometry</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-xs uppercase tracking-wider text-white/50 mb-2">Your Name</label>
              <input 
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ENTER ALIAS"
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-4 text-center text-lg text-white font-mono tracking-wide focus:outline-none focus:border-purple-500 transition-colors"
                maxLength={12}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-white/50 mb-2">Room Code</label>
              <input 
                type="text"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="ROOM ID"
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-4 text-center text-lg text-white font-mono tracking-widest focus:outline-none focus:border-purple-500 transition-colors uppercase"
                maxLength={8}
              />
              <p className="text-[10px] text-white/30 mt-2 text-center">
                Open this app in multiple tabs with the same code to play together.
              </p>
            </div>

            <button 
              type="submit"
              disabled={!name || !room}
              className="w-full bg-white text-black font-bold uppercase tracking-widest py-4 rounded-lg hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Enter Room
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Lobby;
