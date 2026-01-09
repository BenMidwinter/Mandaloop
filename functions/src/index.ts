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
        vibratoSpeed: { type: SchemaType.NUMBER },
        vibratoDepth: { type: SchemaType.NUMBER }
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
        model: "gemini-3-flash-preview", // Reverted to stable model (gemini-3 is often experimental)
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: themeSchema
        }
    });

    try {
        const seedInstruction = seed ? ` Use the seed word "${seed}" to strictly determine the style.` : "";
        
        // --- UPDATED PROMPT: INJECTING THE MENU ---
        const fullPrompt = `
          Create a unique audiovisual theme for a musical mandala app.${seedInstruction} 
          The concept is: "${prompt}". 
          Make the sound large and textured.
          
          CRITICAL INSTRUCTION: 
          The 'scale' field MUST be strictly one of these values: ${VALID_SCALES.join(', ')}.
          Do not use spaces or capital letters for the scale (e.g. use "pentatonic_minor", not "Pentatonic Minor").
        `;

        const result = await model.generateContent(fullPrompt);
        const responseText = result.response.text();
        const data = JSON.parse(responseText);

        // --- NEW: THE BOUNCER (Safety Check) ---
        // Even with instructions, AI sometimes hallucinates. We catch it here.
        if (!VALID_SCALES.includes(data.scale)) {
            console.warn(`AI Hallucinated scale: '${data.scale}'. Defaulting to 'pentatonic_minor'.`);
            
            // Smart Fallback
            if (data.scale.toLowerCase().includes('minor')) data.scale = 'pentatonic_minor';
            else if (data.scale.toLowerCase().includes('major')) data.scale = 'pentatonic_major';
            else data.scale = 'pentatonic_minor';
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