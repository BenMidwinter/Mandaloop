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
    scale: { type: SchemaType.STRING, description: "The musical scale pattern. CRITICAL: Return the scale name ONLY. Do NOT include a root note or key. Correct: 'dorian'. Incorrect: 'C Dorian'. Incorrect: 'Dorian Mode'." },
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
          - STRICTLY FORBIDDEN: Do not include a root note (e.g. "C", "F#").
          - STRICTLY FORBIDDEN: Do not add the word "Mode" or "Scale".
          - Correct: "dorian". 
          - Incorrect: "C Dorian", "Dorian Mode", "Dorian Scale".
        `;

        const result = await model.generateContent(fullPrompt);
        const data = JSON.parse(result.response.text());

   // --- STEP 1: ROBUST KEYWORD SCANNER ---
        // We convert to lowercase. 
        // This naturally strips root notes because we aren't checking for them.
        // "C Dorian" becomes "c dorian". We look for "dorian". It matches.
        
        let rawScale = (data.scale || "").toLowerCase();
        let finalScale = 'pentatonic_major'; // The ultimate safety net

        // 1. Check for Complex/Specific Scales first
        if (rawScale.includes('pentatonic')) {
            // Catches: "Minor Pentatonic", "Eb Minor Pentatonic"
            if (rawScale.includes('minor')) finalScale = 'pentatonic_minor';
            else finalScale = 'pentatonic_major';
        }
        else if (rawScale.includes('harmonic') && rawScale.includes('minor')) {
            finalScale = 'harmonic_minor';
        }
        else if (rawScale.includes('whole')) {
            finalScale = 'whole_tone';
        }
        else if (rawScale.includes('chromatic')) {
            finalScale = 'chromatic';
        }
        else if (rawScale.includes('hirajoshi')) {
            finalScale = 'hirajoshi';
        }
        else if (rawScale.includes('pelog')) {
            finalScale = 'pelog';
        }
        
        // 2. Check for Modes
        // CRITICAL: Check Mixolydian BEFORE Lydian, as "mixolydian" contains "lydian"
        else if (rawScale.includes('mixolydian')) {
             finalScale = 'mixolydian';
        }
        else if (rawScale.includes('lydian')) {
            finalScale = 'lydian';
        }
        else if (rawScale.includes('dorian')) {
            finalScale = 'dorian';
        }
        else if (rawScale.includes('phrygian')) {
            finalScale = 'phrygian';
        }
        else if (rawScale.includes('locrian')) {
            finalScale = 'locrian';
        }
        
        // 3. Basic Major/Minor (The Catch-Alls)
        // Check these LAST. "Pentatonic Major" contains "major", so we must 
        // rule out Pentatonic (Step 1) before checking for plain Major.
        else if (rawScale.includes('minor')) {
            finalScale = 'minor';
        }
        else if (rawScale.includes('major')) {
            finalScale = 'major';
        }

        // Apply the detected scale
        console.log(`AI Scale: "${data.scale}" -> Detected: "${finalScale}"`);
        data.scale = finalScale;

        // --- STEP 2: SAFETY CHECK ---
        // If the AI hallucinated something totally wild like "Bebop Blues",
        // none of the above ifs will trigger, and it stays 'pentatonic_major'.
        // This block ensures we only pass valid keys to the frontend.
        if (!VALID_SCALES.includes(data.scale)) {
            data.scale = 'pentatonic_major';
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