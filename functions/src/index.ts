import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { onValueWritten } from "firebase-functions/v2/database"; // <--- NEW
import * as admin from "firebase-admin"; // <--- NEW
import { getDatabase } from "firebase-admin/database"; // <--- NEW
import { GoogleGenerativeAI, Schema, SchemaType } from "@google/generative-ai";

// 0. Initialize Admin (Required for database deletions)
admin.initializeApp();

// 1. Set region to London
setGlobalOptions({ region: "europe-west2" });

// 2. Define the Schema locally
const themeSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    name: { type: SchemaType.STRING },
    colors: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    scale: { type: SchemaType.STRING },
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
  required: ["name", "colors", "scale", "synthConfig"]
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
        model: "gemini-3-flash-preview",
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: themeSchema
        }
    });

    try {
        const seedInstruction = seed ? ` Use the seed word "${seed}" to strictly determine the style.` : "";
        const fullPrompt = `Create a unique audiovisual theme for a musical mandala app.${seedInstruction} The concept is: "${prompt}". Make the sound large and textured.`;

        const result = await model.generateContent(fullPrompt);
        const responseText = result.response.text();
        
        return JSON.parse(responseText);

    } catch (error: any) {
        console.error("Gemini Server Error:", error);
        throw new HttpsError('internal', error.message || "Failed to generate theme");
    }
});

// 4. The Janitor Protocol (Database Trigger)
// Watch the "users" node of any room. If it becomes empty, delete the room.
export const cleanupEmptyRoom = onValueWritten(
    {
        ref: "rooms/{roomId}/users",
        region: "europe-west1",
    },
    async (event) => {
        // If the data was deleted (does not exist) or has 0 children
        if (!event.data.after.exists() || event.data.after.numChildren() === 0) {
            
            const roomId = event.params.roomId;
            const db = getDatabase();
            const roomRef = db.ref(`rooms/${roomId}`);

            // Check if the room still exists (to prevent loops or errors)
            const snapshot = await roomRef.once('value');
            if (snapshot.exists()) {
                console.log(`Janitor Protocol: Room ${roomId} is empty. Wiping data.`);
                await roomRef.remove();
            }
        }
    }
);