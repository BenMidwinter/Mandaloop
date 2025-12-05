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
    // Use note index (type) to determine shape
    const shapeType = type % 4;
    
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
    // If 1 user: 12 repetitions (Full Mandala)
    // If 2 users: 6 repetitions each (Split Mandala)
    // If 3 users: 4 repetitions each
    const symmetryPerUser = Math.max(1, Math.floor(12 / users.length));
    const angleStep = sliceAngle / symmetryPerUser;

    users.forEach((user, i) => {
      const userStartAngle = i * sliceAngle;
      
      const hasVibrato = user.activeEffects.includes('vibrato');
      const hasFilter = user.activeEffects.includes('filter_close');
      const hasDistort = user.activeEffects.includes('distort');
      const hasReverb = user.activeEffects.includes('reverb_max');

      // Draw Separators
      if (users.length > 1) {
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX + Math.cos(userStartAngle) * maxRadius * 1.2, centerY + Math.sin(userStartAngle) * maxRadius * 1.2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      user.activeNotes.forEach(noteIndex => {
        // Map note to radius (Inner -> Outer)
        const radiusStep = maxRadius / 15;
        const baseRadius = (noteIndex + 1) * radiusStep;
        
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
            // Calculate center of this repetition
            // We center the shape within its mini-slice
            const currentAngle = userStartAngle + (s * angleStep) + (angleStep / 2);
            
            const x = centerX + Math.cos(currentAngle) * radius;
            const y = centerY + Math.sin(currentAngle) * radius;

            // Rotation of the shape itself (points towards center)
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(currentAngle + Math.PI/2); // Align shape with radius

            // Size varies with note pitch (lower notes = larger shapes, higher = smaller)
            const size = Math.max(4, 15 - (noteIndex * 0.8));
            
            // Draw
            drawShape(ctx, 0, 0, size, noteIndex, !hasDistort); // Distort makes it wireframe
            
            ctx.restore();
        }

        // Reset global alpha
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