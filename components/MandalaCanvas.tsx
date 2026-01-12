import React, { useRef, useEffect } from 'react';
import { UserState, Theme } from '../types';

interface MandalaCanvasProps {
  users: UserState[];
  theme: Theme;
  scaleType: string;
}

// --- OPTIMIZATION: Helper outside component ---
const TOTAL_SLOTS = 12;
const MAX_INDEX = 24;

const createPetalPath = (ctx: CanvasRenderingContext2D, size: number, noteIndex: number) => {
  ctx.beginPath();
  const t = Math.min(1, noteIndex / MAX_INDEX);
  let widthRatio = 1.8 - (1.5 * t); 
  if (noteIndex <= 1) widthRatio = 2.2; 
  const width = size * widthRatio;
  const tipY = -size * 1.8;   
  const baseY = size * 0.2; 
  ctx.moveTo(0, baseY); 
  ctx.quadraticCurveTo(width, 0, 0, tipY);
  ctx.quadraticCurveTo(-width, 0, 0, baseY);
  ctx.closePath();
};

const MandalaCanvas: React.FC<MandalaCanvasProps> = ({ users, theme, scaleType }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);

  const render = (time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (users.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        requestRef.current = requestAnimationFrame((t) => render(t));
        return;
    }

    // Reset Canvas
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(5, 5, 5, 0.1)'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const maxRadius = Math.min(canvas.width, canvas.height) * 0.45;
    const baseAngleStep = (Math.PI * 2) / TOTAL_SLOTS;

    // Tremolo
    const rawDepth = theme.synthConfig.vibratoDepth || 0;
    const lfoSpeed = 3 + ((rawDepth / 30) * 5); 
    const pulseFactor = 1 + (Math.sin(time * 0.001 * lfoSpeed * Math.PI * 2) * (rawDepth / 30) * 0.15);

    // ==========================================
    // LAYER 1: FILLS (Glow Source for Normal/Filter)
    // ==========================================
    for (let i = 0; i < TOTAL_SLOTS; i++) {
        const userIndex = i % users.length;
        const user = users[userIndex];
        if (!user) continue;

        const activeEffects = user.activeEffects || [];
        // RULE: Distortion removes fill. We skip Layer 1 entirely for Distort.
        if (activeEffects.includes('distort')) continue; 

        const hasFilter = activeEffects.includes('filter_close');
        const hasReverb = activeEffects.includes('reverb_max');
        const activeNotes = user.activeNotes || [];
        const sortedNotes = [...activeNotes].sort((a, b) => a - b);
        const radiusStep = maxRadius / 38; 

        sortedNotes.forEach((noteIndex) => {
            const baseRadius = (noteIndex + 2) * radiusStep;
            
            // Color Logic
            const hasColors = theme.colors && theme.colors.length > 0;
            const safeIndex = hasColors ? noteIndex % theme.colors.length : 0;
            const color = hasColors ? theme.colors[safeIndex] : '#FFFFFF';
            
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
                
                // --- STRATEGY: GLOW ON FILL ---
                // For Normal/Filter, the FILL creates the glow.
                // This allows the stroke (Layer 2) to be black without killing the light.
                
                // 1. Calculate Glow
                const baseGlow = Math.max(30, size * 0.6); 
                const reverbBoost = hasReverb ? 60 : 0;
                ctx.shadowColor = color;
                ctx.shadowBlur = baseGlow + reverbBoost;

                // 2. Set Opacity (Filter Logic)
                // Filter cuts opacity in half.
                // We keep alpha relatively low (0.3) so the body isn't solid paint,
                // but the Shadow Blur will still be bright.
                const alpha = hasFilter ? 0.15 : 0.3;
                
                ctx.fillStyle = color;
                ctx.globalAlpha = alpha; 
                
                ctx.fill();
                ctx.restore();
            }
        });
    }

    // ==========================================
    // LAYER 2: STROKES (Structure OR Glow Source for Distort)
    // ==========================================
    for (let i = 0; i < TOTAL_SLOTS; i++) {
        const userIndex = i % users.length;
        const user = users[userIndex];
        if (!user) continue;

        const activeEffects = user.activeEffects || [];
        const hasFilter = activeEffects.includes('filter_close');
        const hasReverb = activeEffects.includes('reverb_max');
        const hasDistort = activeEffects.includes('distort');

        const activeNotes = user.activeNotes || [];
        const sortedNotes = [...activeNotes].sort((a, b) => a - b);
        const radiusStep = maxRadius / 38;

        sortedNotes.forEach((noteIndex) => {
            const baseRadius = (noteIndex + 2) * radiusStep;
            const color = (theme.colors && theme.colors[noteIndex % theme.colors.length]) || '#FFFFFF';
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

                if (hasDistort) {
                    // --- STRATEGY: GLOW ON STROKE (Distort Only) ---
                    // Since Distort has no fill, the Stroke MUST carry the glow.
                    // Because it's a neon line (not black), we don't have transparency issues.
                    const baseGlow = Math.max(30, size * 0.6);
                    const reverbBoost = hasReverb ? 60 : 0;
                    
                    ctx.shadowColor = color;
                    ctx.shadowBlur = baseGlow + reverbBoost;
                    
                    ctx.strokeStyle = color; // Neon Line
                    ctx.lineWidth = 3;
                    ctx.globalAlpha = hasFilter ? 0.3 : 1.0;
                    ctx.stroke();

                } else {
                    // --- STRATEGY: STRUCTURE ONLY (Normal/Filter) ---
                    // The glow was already handled by Layer 1 (Fill).
                    // We just draw the black wireframe here.
                    
                    ctx.shadowBlur = 0; // No double-glow (prevents lag)
                    
                    // Filter reduces line opacity
                    const opacity = hasFilter ? 0.1 : 0.4;
                    ctx.strokeStyle = `rgba(0, 0, 0, ${opacity})`; 
                    ctx.lineWidth = 4;
                    
                    // Note: We don't need globalAlpha here because we set the color alpha directly.
                    ctx.globalAlpha = 1.0; 
                    ctx.stroke();
                }
                
                ctx.restore();
            }
        });
    }

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