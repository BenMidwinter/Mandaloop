import React, { useRef, useEffect } from 'react';
import { UserState, Theme } from '../types';

interface MandalaCanvasProps {
  users: UserState[];
  theme: Theme;
  scaleType: string;
}

const MandalaCanvas: React.FC<MandalaCanvasProps> = ({ users, theme, scaleType }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);

  // Helper to create the path (Used by both Fill and Stroke passes)
  const createPetalPath = (ctx: CanvasRenderingContext2D, size: number, noteIndex: number) => {
    ctx.beginPath();
    
    // --- GEOMETRY ---
    const maxIndex = 24; 
    const t = Math.min(1, noteIndex / maxIndex);

    // Width: Wide Bass -> Thin Treble
    let widthRatio = 1.8 - (1.5 * t); 
    if (noteIndex <= 1) widthRatio = 2.2; 

    const width = size * widthRatio;
    
    // Height: 1.8x stretch
    const tipY = -size * 1.8;   
    const baseY = size * 0.2; 
    
    ctx.moveTo(0, baseY); 
    ctx.quadraticCurveTo(width, 0, 0, tipY);
    ctx.quadraticCurveTo(-width, 0, 0, baseY);
    ctx.closePath();
  };

  const render = (time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset Canvas
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(5, 5, 5, 0.1)'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const maxRadius = Math.min(canvas.width, canvas.height) * 0.45;
    
    // --- GLOBAL GRID LOGIC ---
    // Fixed 12 slots (Clock Face) ensures perfect symmetry regardless of user count
    const TOTAL_SLOTS = 12; 
    const baseAngleStep = (Math.PI * 2) / TOTAL_SLOTS;

    // --- TREMOLO CALC ---
    const rawDepth = theme.synthConfig.vibratoDepth || 0;
    const lfoSpeed = 3 + ((rawDepth / 30) * 5); 
    const pulseFactor = 1 + (Math.sin(time * 0.001 * lfoSpeed * Math.PI * 2) * (rawDepth / 30) * 0.15);

    // ==========================================
    // LAYER 1: FILLS
    // ==========================================
    for (let i = 0; i < TOTAL_SLOTS; i++) {
        // "Deal the cards": Assign slot to a user based on modulo
        if (users.length === 0) break;
        const userIndex = i % users.length;
        const user = users[userIndex];
        if (!user) continue;

        const activeEffects = user.activeEffects || [];
        if (activeEffects.includes('distort')) continue; // Skip fills if distort

        const hasFilter = activeEffects.includes('filter_close');
        
        const activeNotes = user.activeNotes || [];
        const sortedNotes = [...activeNotes].sort((a, b) => a - b);
        const radiusStep = maxRadius / (38); 

        sortedNotes.forEach((noteIndex) => {
            const baseRadius = (noteIndex + 2) * radiusStep;
            
            // --- DYNAMIC DENSITY (High Notes) ---
            const densityMultiplier = noteIndex > 10 ? 2 : 1;
            const currentAngleStep = baseAngleStep / densityMultiplier;

            // --- STAGGER LOGIC (Absolute Pitch) ---
            const isOddLayer = noteIndex % 2 !== 0;
            const staggerRotation = isOddLayer ? (currentAngleStep / 2) : 0;

            // Safety Color
        // --- SAFETY COLOR LOGIC ---
            // 1. Check if we actually have a colors array
            const hasColors = theme.colors && theme.colors.length > 0;
            
            // 2. Safe Modulo: If no colors, default to 0 to avoid NaN
            const safeIndex = hasColors ? noteIndex % theme.colors.length : 0;
            
            // 3. Final Pickup: Get the color OR fallback to White
            const color = hasColors ? theme.colors[safeIndex] : '#FFFFFF';
            ctx.fillStyle = color;
            ctx.globalAlpha = hasFilter ? 0.2 : 0.4; 
            ctx.shadowBlur = 0;

            // Draw Sub-Petals (1 for low notes, 2 for high notes)
            for (let d = 0; d < densityMultiplier; d++) {
                // Calculate EXACT Global Angle
                const slotStartAngle = i * baseAngleStep;
                const subOffset = d * currentAngleStep;
                const currentAngle = slotStartAngle + subOffset + (currentAngleStep / 2) + staggerRotation;

                const x = centerX + Math.cos(currentAngle) * baseRadius;
                const y = centerY + Math.sin(currentAngle) * baseRadius;

                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(currentAngle + Math.PI/2); 

                // Check USER SPECIFIC Tremolo
                const userHasTremolo = activeEffects.includes('vibrato');
                const size = Math.max(15, radiusStep * 4.5) * (userHasTremolo ? pulseFactor : 1);
                
                createPetalPath(ctx, size, noteIndex);
                ctx.fill();
                ctx.restore();
            }
        });
    }

    // ==========================================
    // LAYER 2: STROKES
    // ==========================================
    for (let i = 0; i < TOTAL_SLOTS; i++) {
        if (users.length === 0) break;
        const userIndex = i % users.length;
        const user = users[userIndex];
        if (!user) continue;

        const activeEffects = user.activeEffects || [];
        const hasFilter = activeEffects.includes('filter_close');
        const hasReverb = activeEffects.includes('reverb_max');
        const hasDistort = activeEffects.includes('distort');

        const activeNotes = user.activeNotes || [];
        const sortedNotes = [...activeNotes].sort((a, b) => a - b);
        const radiusStep = maxRadius / (38);

        sortedNotes.forEach((noteIndex) => {
            const baseRadius = (noteIndex + 2) * radiusStep;
            const color = (theme.colors && theme.colors[noteIndex % theme.colors.length]) || '#FFFFFF';
            
            ctx.shadowColor = color;
            ctx.shadowBlur = hasReverb ? 50 : 15;

            if (hasDistort) {
                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.globalAlpha = hasFilter ? 0.3 : 1.0; 
            } else {
                ctx.strokeStyle = "rgba(0, 0, 0, 1)"; 
                ctx.lineWidth = 4;
                ctx.globalAlpha = hasFilter ? 0.1 : 0.4;
            }

            const densityMultiplier = noteIndex > 10 ? 2 : 1;
            const currentAngleStep = baseAngleStep / densityMultiplier;
            const isOddLayer = noteIndex % 2 !== 0;
            const staggerRotation = isOddLayer ? (currentAngleStep / 2) : 0;

            for (let d = 0; d < densityMultiplier; d++) {
                const slotStartAngle = i * baseAngleStep;
                const subOffset = d * currentAngleStep;
                const currentAngle = slotStartAngle + subOffset + (currentAngleStep / 2) + staggerRotation;

                const x = centerX + Math.cos(currentAngle) * baseRadius;
                const y = centerY + Math.sin(currentAngle) * baseRadius;

                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(currentAngle + Math.PI/2); 

                const userHasTremolo = activeEffects.includes('vibrato');
                const size = Math.max(15, radiusStep * 4.5) * (userHasTremolo ? pulseFactor : 1);
                
                createPetalPath(ctx, size, noteIndex);
                ctx.stroke();
                ctx.restore();
            }
        });
    }

    // Center point
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, Math.PI*2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    requestRef.current = requestAnimationFrame((t) => render(t));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', resize);
    resize();
    requestRef.current = requestAnimationFrame((t) => render(t));
    return () => { window.removeEventListener('resize', resize); if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [users, theme, scaleType]);

  return <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full z-0" />;
};

export default MandalaCanvas;