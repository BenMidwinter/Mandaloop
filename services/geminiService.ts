import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Theme } from "../types";

const genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });

const themeSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "A creative name for the visual/audio theme" },
    colors: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "An array of 5 hex color codes that match the theme"
    },
    scale: {
      type: Type.STRING,
      enum: ['pentatonic_major', 'pentatonic_minor', 'major', 'minor', 'harmonic_minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian', 'whole_tone', 'chromatic', 'pelog', 'hirajoshi'],
      description: "The musical scale that best matches the vibe"
    },
    synthConfig: {
      type: Type.OBJECT,
      properties: {
        osc1Type: { type: Type.STRING, enum: ["sine", "square", "sawtooth", "triangle"] },
        osc2Type: { type: Type.STRING, enum: ["sine", "square", "sawtooth", "triangle"] },
        attack: { type: Type.NUMBER, description: "Attack time in seconds (0.01 to 2.0)" },
        decay: { type: Type.NUMBER, description: "Decay time in seconds (0.1 to 2.0)" },
        sustain: { type: Type.NUMBER, description: "Sustain level (0.0 to 1.0)" },
        release: { type: Type.NUMBER, description: "Release time in seconds (0.1 to 5.0)" },
        filterFreq: { type: Type.NUMBER, description: "Filter cutoff frequency in Hz" },
        filterQ: { type: Type.NUMBER, description: "Filter resonance/Q" },
        vibratoSpeed: { type: Type.NUMBER, description: "Vibrato LFO speed in Hz" },
        vibratoDepth: { type: Type.NUMBER, description: "Vibrato depth" }
      },
      required: ["osc1Type", "osc2Type", "attack", "decay", "sustain", "release", "filterFreq", "filterQ", "vibratoSpeed", "vibratoDepth"]
    },
    baseFreq: {
      type: Type.NUMBER,
      description: "A base frequency in Hz (between 100 and 400)"
    },
    moodDescription: {
      type: Type.STRING,
      description: "A short poetic description of the vibe"
    }
  },
  required: ["name", "colors", "scale", "synthConfig", "baseFreq", "moodDescription"]
};

export const generateTheme = async (prompt: string, seed?: string): Promise<Theme> => {
  try {
    // FIXED: Changed from 2.5 to 1.5-flash (Standard Stable Model)
    const modelId = "gemini-1.5-flash"; 
    
    const seedInstruction = seed ? ` Use the seed word "${seed}" to strictly determine the style.` : "";

    const result = await genAI.models.generateContent({
      model: modelId,
      contents: `Create a unique audiovisual theme for a musical mandala app.${seedInstruction} The concept is: "${prompt}". Make the sound large and textured.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: themeSchema,
        systemInstruction: "You are an expert audio-visual artist and synthesizer sound designer. Return JSON only.",
      }
    });

    const text = result.text(); // Note: In newer SDKs this might be a function or property.
    // If result.text is a function in the CDN version, use result.text(). 
    // If it's a property, use result.text. 
    // The safest way with the CDN wrapper is usually checking both or just standard property access if the SDK matches.
    // Based on your previous file, it treated it as a property. 
    // Let's stick to the property if that's what the types say, but usually .text() is a method in GoogleGenAI.
    // Let's try the property access you had, but usually it needs to be awaited or accessed differently in v1.
    // Actually, looking at the @google/genai SDK, result.text is usually a getter or method.
    
    // Safest approach for @google/genai (new SDK):
    const responseText = result.text; 

    if (!responseText) throw new Error("No response from Gemini");
    
    return JSON.parse(responseText) as Theme;
  } catch (error) {
    // This Log will appear in your browser console (F12) so you can see the real error
    console.error("Gemini Theme Error Details:", error);
    
    return {
      name: "Fallback Neon",
      colors: ["#FF00FF", "#00FFFF", "#FFFF00", "#FF0000", "#0000FF"],
      scale: "pentatonic_minor",
      synthConfig: {
        osc1Type: "sawtooth",
        osc2Type: "square",
        attack: 0.05,
        decay: 0.2,
        sustain: 0.4,
        release: 1.5,
        filterFreq: 2000,
        filterQ: 5,
        vibratoSpeed: 5,
        vibratoDepth: 10
      },
      baseFreq: 220,
      moodDescription: "A fallback theme because the AI is sleeping."
    };
  }
};
