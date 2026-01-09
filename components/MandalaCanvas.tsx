import React, { useRef, useEffect } from 'react';
import { UserState, Theme } from '../types';

interface MandalaCanvasProps {
  users: UserState[];
  theme: Theme;
  scaleType: string; // <--- ADDED THIS PROP
}

const MandalaCanvas: React.FC<MandalaCanvasProps> = ({ users, theme, scaleType }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);

  // 
  // Helper to map Chromatic Pitch (0-11) to Visual Scale Degree (0-4 or 0-6)
  const getVisualPosition = (noteIndex: number, type: string) => {
    const octave = Math.floor(noteIndex / 12);
    const pitchClass = noteIndex % 12;

    if (type === 'pentatonic') {
        // Pentatonic Map: 0,2,4,7,9 -> 0,1,2,3,4
        // If a note falls in a gap (rare), we map it to the nearest lower neighbor
        const map = [0, 0, 1, 1, 2, 3, 3, 4, 4, 4, 5, 5]; 
        return (octave * 5) + map[pitchClass];
    }
    // Default / Diatonic (Assume 7 notes roughly map to chromatic)
    // This squashes the 12 chromatic steps into 7 visual steps
    const map = [0, 0, 1, 1, 2, 3, 3, 4, 5, 5, 6, 6];
    return (octave * 7) + map[pitchClass];
  };

  // Helper to draw specific geometric shapes
  const drawShape = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, type: number, filled: boolean) => {
    ctx.beginPath();
    const shapeType = type % 5;
    
    if (shapeType === 0) {
        // Circle
        ctx.arc(x, y, size, 0, Math.PI * 2);
    } else if (shapeType === 1) {
        // Diamond
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x - size, y);
        ctx.closePath();
    } else if (shapeType === 2) {
        // Triangle
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size, y + size);
        ctx.lineTo(x - size, y + size);
        ctx.closePath();
    } else if (shapeType === 3) {
        // Hexagon-ish (Star)
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const px = x + Math.cos(angle) * size;
            const py = y + Math.sin(angle) * size;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
    } else if (shapeType === 4) {
        // The Ace
        ctx.moveTo(x, y - size); 
        ctx.bezierCurveTo(x + size, y - size/2, x + size, y + size/2, x, y + size/2); 
        ctx.bezierCurveTo(x - size, y + size/2, x - size, y - size/2, x, y - size); 
        ctx.moveTo(x, y + size/2);
        ctx.lineTo(x + size/4, y + size);
        ctx.lineTo(x - size/4, y + size);
        ctx.lineTo(x, y + size/2);
    }

    if (filled) ctx.fill();
    else ctx.stroke();
  };

  const render = (time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = 'rgba(5, 5, 5, 0.25)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const maxRadius = Math.min(canvas.width, canvas.height) * 0.45;
    
    const sliceAngle = (Math.PI * 2) / users.length;
    const symmetryPerUser = Math.max(1, Math.floor(12 / users.length));
    const angleStep = sliceAngle / symmetryPerUser;

    users.forEach((user, i) => {
      if (!user) return;
      
      const userStartAngle = i * sliceAngle;
      const activeEffects = user.activeEffects || [];
      const activeNotes = user.activeNotes || [];

      const hasVibrato = activeEffects.includes('vibrato');
      const hasFilter = activeEffects.includes('filter_close');
      const hasDistort = activeEffects.includes('distort');
      const hasReverb = activeEffects.includes('reverb_max');

      // Draw Separators
      if (users.length > 1) {
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX + Math.cos(userStartAngle) * maxRadius * 1.2, centerY + Math.sin(userStartAngle) * maxRadius * 1.2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      activeNotes.forEach(noteIndex => {
        // --- KEY FIX STARTS HERE ---
        // 1. Calculate Visual Position (Squashed to remove gaps)
        const visualIndex = getVisualPosition(noteIndex, scaleType);
        
        // 2. Adjust max visual steps based on scale
        // Pentatonic has 15 notes over 3 octaves (5*3). Diatonic has 21 (7*3).
        const maxVisualSteps = scaleType === 'pentatonic' ? 15 : 21;
        
        const radiusStep = maxRadius / (maxVisualSteps + 2); 
        const baseRadius = (visualIndex + 2) * radiusStep;
        // --- KEY FIX ENDS HERE ---
        
        let radius = baseRadius;
        if (hasVibrato) {
          radius += Math.sin(time * 0.05) * 8;
        }

        // NOTE: We still use the original noteIndex for Color and Shape
        // This ensures C always looks like C (Red/Circle), even if its position shifts slightly.
        const color = theme.colors[noteIndex % theme.colors.length];
        
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = hasReverb ? 30 : 5;
        ctx.lineWidth = hasDistort ? 3 : 2;
        ctx.globalAlpha = hasFilter ? 0.3 : 1;
        if (hasFilter) ctx.shadowBlur = 0;

        for (let s = 0; s < symmetryPerUser; s++) {
            const currentAngle = userStartAngle + (s * angleStep) + (angleStep / 2);
            const x = centerX + Math.cos(currentAngle) * radius;
            const y = centerY + Math.sin(currentAngle) * radius;

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(currentAngle + Math.PI/2); 

            // Use noteIndex for size so low notes are still big
            const size = Math.max(8, 22 - (noteIndex * 0.6));
            
            drawShape(ctx, 0, 0, size, noteIndex, !hasDistort); 
            ctx.restore();
        }

        ctx.globalAlpha = 1;
      });
    });

    // Center decorative point
    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, Math.PI*2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    requestRef.current = requestAnimationFrame((t) => render(t));
  };

  useEffect(() => {
    // ... (Resize logic remains the same)
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();
    requestRef.current = requestAnimationFrame((t) => render(t));
    return () => {
      window.removeEventListener('resize', resize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [users, theme, scaleType]); // <--- ADDED scaleType dependency

  return (
    <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full z-0" />
  );
};

export default MandalaCanvas;