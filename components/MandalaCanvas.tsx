import React, { useRef, useEffect } from 'react';
import { UserState, Theme } from '../types';

interface MandalaCanvasProps {
  users: UserState[];
  theme: Theme;
}

const MandalaCanvas: React.FC<MandalaCanvasProps> = ({ users, theme }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);

  // Helper to draw specific geometric shapes
  const drawShape = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, type: number, filled: boolean) => {
    ctx.beginPath();
    // INCREASED MODULO TO 5 to include the new Ace shape
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
        // NEW SHAPE: The Ace (Stylized Spade)
        // A triangle pointing up with a wider base
        ctx.moveTo(x, y - size); // Top Tip
        ctx.bezierCurveTo(x + size, y - size/2, x + size, y + size/2, x, y + size/2); // Right Curve
        ctx.bezierCurveTo(x - size, y + size/2, x - size, y - size/2, x, y - size); // Left Curve
        
        // The Stem
        ctx.moveTo(x, y + size/2);
        ctx.lineTo(x + size/4, y + size);
        ctx.lineTo(x - size/4, y + size);
        ctx.lineTo(x, y + size/2);
    }

    if (filled) {
        ctx.fill();
    } else {
        ctx.stroke();
    }
  };

  const render = (time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fade trail - Slightly faster fade for crisper shapes
    ctx.fillStyle = 'rgba(5, 5, 5, 0.25)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const maxRadius = Math.min(canvas.width, canvas.height) * 0.45;
    
    // Each user gets a slice
    const sliceAngle = (Math.PI * 2) / users.length;
    
    // Determine radial symmetry count based on user count
    const symmetryPerUser = Math.max(1, Math.floor(12 / users.length));
    const angleStep = sliceAngle / symmetryPerUser;

    users.forEach((user, i) => {
      if (!user) return; // Safety check
      
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
        // UPDATED: Adjusted for 3 Octaves (Range 0-21)
        // Divide by 24 so the highest notes don't fall off the edge
        const radiusStep = maxRadius / 24; 
        const baseRadius = (noteIndex + 2) * radiusStep; // Start slightly further out (center hole)
        
        let radius = baseRadius;
        if (hasVibrato) {
          radius += Math.sin(time * 0.05) * 8;
        }

        const color = theme.colors[noteIndex % theme.colors.length];
        
        // Style Setup
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = hasReverb ? 30 : 5;
        ctx.lineWidth = hasDistort ? 3 : 2;

        if (hasFilter) {
            ctx.globalAlpha = 0.3;
            ctx.shadowBlur = 0;
        } else {
            ctx.globalAlpha = 1;
        }

        // Draw Symmetry Repetitions
        for (let s = 0; s < symmetryPerUser; s++) {
            const currentAngle = userStartAngle + (s * angleStep) + (angleStep / 2);
            
            const x = centerX + Math.cos(currentAngle) * radius;
            const y = centerY + Math.sin(currentAngle) * radius;

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(currentAngle + Math.PI/2); 

            // UPDATED SIZE LOGIC:
            // Base size is 22 (bigger).
            // Shrinks slower (0.6 multiplier).
            // Minimum size is 8 (never disappears).
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
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#fff';
    ctx.fill();
    ctx.shadowBlur = 0;

    requestRef.current = requestAnimationFrame((t) => render(t));
  };

  useEffect(() => {
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
  }, [users, theme]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 w-full h-full z-0"
    />
  );
};

export default MandalaCanvas;