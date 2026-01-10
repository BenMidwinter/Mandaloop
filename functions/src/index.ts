import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { onValueWritten } from "firebase-functions/v2/database"; 
import * as admin from "firebase-admin"; 
import { getDatabase } from "firebase-admin/database"; 
import { GoogleGenerativeAI, Schema, SchemaType } from "@google/generative-ai";

// 0. Initialize Admin
admin.initializeApp();

// 1. Set region
setGlobalOptions({ region: "europe-west2" });

// --- NEW: DEFINE THE VALID SCALES MENU ---
const VALID_SCALES = [
  "pentatonic_major", "pentatonic_minor", "major", "minor",
  "harmonic_minor", "dorian", "phrygian", "lydian", 
  "mixolydian", "locrian", "whole_tone", "chromatic", 
  "pelog", "hirajoshi"
];

// 2. Define the Schema locally (Updated with 'key' and 'explanation')
const themeSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    name: { type: SchemaType.STRING },
    colors: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    
    // We add KEY and EXPLANATION here so the frontend can snap the synth
    key: { type: SchemaType.STRING, description: "Musical Key (e.g. C, F#, Bb)" },
    scale: { type: SchemaType.STRING, description: `Must be one of: ${VALID_SCALES.join(', ')}` },
    explanation: { type: SchemaType.STRING },

    synthConfig: {
      type: SchemaType.OBJECT,
      properties: {
        osc1Type: { type: SchemaType.STRING },
        osc2Type: { type: SchemaType.STRING },
        attack: { type: SchemaType.NUMBER },
        decay: { type: SchemaType.NUMBER },
        sustain: { type: SchemaType.NUMBER },
        release: { type: SchemaType.NUMBER },
        filterFreq: { type: SchemaType.NUMBER },
        filterQ: { type: SchemaType.NUMBER },
        vibratoSpeed: { type: SchemaType.NUMBER, description: "IGNORE. Set to 0. Speed is now auto-calculated bsaed on depth." },
        vibratoDepth: { type: SchemaType.NUMBER, description: "TREMOLO INTENSITY (0-30).  Controls both volume dip and speed.  High = Strobe/Helicopter effect.  Low = Gentle Pulse." }
      }
    },
    baseFreq: { type: SchemaType.NUMBER },
    moodDescription: { type: SchemaType.STRING }
  },
  required: ["name", "colors", "scale", "key", "synthConfig"]
};

// 3. The Secure Function (Gemini)
export const generateMandalaTheme = onCall({ secrets: ["GEMINI_API_KEY"] }, async (request) => {
    const { prompt, seed } = request.data;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        throw new HttpsError('internal', 'API Key not found in environment secrets.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: themeSchema
        }
    });

    try {
        const seedInstruction = seed ? ` Use the seed word "${seed}" to strictly determine the style.` : "";
        
        // --- PROMPT ENGINEERING ---
        const fullPrompt = `
          Create a unique audiovisual theme for a musical mandala app.${seedInstruction} 
          The concept is: "${prompt}". 
          
          VISUAL RULES:
          - Colors must be NEON and HIGH VISIBILITY. 
          - Do NOT use black, dark gray, or dark blue.
          
          MUSICAL RULES:
          - The 'scale' field must be exactly one of: ${VALID_SCALES.join(', ')}.
          - Do NOT invent scales (e.g. do not use "Dominant Phrygian", "Lydian #2").
          - If you want a dominant sound, pick 'harmonic_minor' or 'phrygian'.
          - If the user asks for "Locrian", you MUST set scale: "locrian".
        `;

        const result = await model.generateContent(fullPrompt);
        const data = JSON.parse(result.response.text());

   // --- STEP 1: SCALE SANITIZATION & TRANSLATION ---
        let rawScale = data.scale || "";
        
        // NEW: "De-Fluffing" - Remove noise words like "mode", "scale"
        // e.g., "Locrian Mode" -> "locrian"
        let cleanScale = rawScale.toLowerCase()
            .replace(" mode", "")
            .replace(" scale", "")
            .replace(" key", "")
            .trim()
            .replace(/\s+/g, "_");

        // Common AI Hallucination Fixes (Keep existing ones)
        if (cleanScale.includes('dominant_phrygian')) cleanScale = 'phrygian'; 
        if (cleanScale.includes('phrygian_dominant')) cleanScale = 'phrygian';
        if (cleanScale.includes('mixolydian_b6')) cleanScale = 'minor'; 
        if (cleanScale === 'major_pentatonic') cleanScale = 'pentatonic_major';
        if (cleanScale === 'minor_pentatonic') cleanScale = 'pentatonic_minor';

        // --- STEP 2: THE BOUNCER ---
        if (VALID_SCALES.includes(cleanScale)) {
            data.scale = cleanScale;
        } else {
            console.warn(`AI Scale Mismatch: '${rawScale}' -> '${cleanScale}'. Attempting smart fallback.`);
            
            // Fuzzy Matching (Order matters! Complex scales first)
            if (cleanScale.includes('locrian')) data.scale = 'locrian';
            else if (cleanScale.includes('harmonic')) data.scale = 'harmonic_minor';
            else if (cleanScale.includes('dorian')) data.scale = 'dorian';
            else if (cleanScale.includes('phrygian')) data.scale = 'phrygian';
            else if (cleanScale.includes('lydian') && !cleanScale.includes('mixo')) data.scale = 'lydian';
            else if (cleanScale.includes('mixolydian')) data.scale = 'mixolydian';
            else if (cleanScale.includes('whole')) data.scale = 'whole_tone';
            else if (cleanScale.includes('chromatic')) data.scale = 'chromatic';
            else if (cleanScale.includes('pelog')) data.scale = 'pelog';
            else if (cleanScale.includes('hirajoshi')) data.scale = 'hirajoshi';
            else if (cleanScale.includes('minor')) data.scale = 'pentatonic_minor';
            else if (cleanScale.includes('major')) data.scale = 'pentatonic_major';
            else {
                // If it fails completely, try to rescue it based on the description
                const desc = (data.explanation || "").toLowerCase();
                if (desc.includes('locrian')) data.scale = 'locrian';
                else if (desc.includes('dreamy')) data.scale = 'whole_tone';
                else if (desc.includes('middle east')) data.scale = 'harmonic_minor';
                else data.scale = 'pentatonic_minor'; // Ultimate fallback
            }
        }

        // --- STEP 3: COLOR BOOSTER (Fixing "Too Dark") ---
        // This ensures every color has at least 50% lightness
        if (data.colors && Array.isArray(data.colors)) {
            data.colors = data.colors.map((hex: string) => {
                // Basic Hex to RGB
                let r = 0, g = 0, b = 0;
                if (hex.length === 4) {
                    r = parseInt("0x" + hex[1] + hex[1]);
                    g = parseInt("0x" + hex[2] + hex[2]);
                    b = parseInt("0x" + hex[3] + hex[3]);
                } else if (hex.length === 7) {
                    r = parseInt("0x" + hex[1] + hex[2]);
                    g = parseInt("0x" + hex[3] + hex[4]);
                    b = parseInt("0x" + hex[5] + hex[6]);
                }
                
                // RGB to HSL Lightness check
                const max = Math.max(r, g, b) / 255;
                const min = Math.min(r, g, b) / 255;
                let l = (max + min) / 2;

                // If too dark (Lightness < 0.5), boost it
                if (l < 0.5) {
                    // Simple brighten: blend with white
                    const boost = 0.5; // 50% lighter
                    r = Math.floor(Math.min(255, r + (255 - r) * boost));
                    g = Math.floor(Math.min(255, g + (255 - g) * boost));
                    b = Math.floor(Math.min(255, b + (255 - b) * boost));
                    
                    // Convert back to Hex
                    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
                }
                return hex;
            });
        }

        return data;

    } catch (error: any) {
        console.error("Gemini Server Error:", error);
        throw new HttpsError('internal', error.message || "Failed to generate theme");
    }
});

// 4. The Janitor Protocol (Kept exactly as you had it)
export const cleanupEmptyRoom = onValueWritten(
    {
        ref: "rooms/{roomId}/users",
        region: "europe-west1",
    },
    async (event) => {
        if (!event.data.after.exists() || event.data.after.numChildren() === 0) {
            
            const roomId = event.params.roomId;
            const db = getDatabase();
            const roomRef = db.ref(`rooms/${roomId}`);

            const snapshot = await roomRef.once('value');
            if (snapshot.exists()) {
                console.log(`Janitor Protocol: Room ${roomId} is empty. Wiping data.`);
                await roomRef.remove();
            }
        }
    }
);