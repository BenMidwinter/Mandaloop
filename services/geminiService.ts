import { getFunctions, httpsCallable } from "firebase/functions";
import { Theme } from "../types";

// Note: The 'themeSchema' is no longer needed here because the 
// backend now handles the strict JSON structure.

export const generateMandalaTheme = async (prompt: string, seed?: string): Promise<Theme> => {
  try {
    console.log("Requesting theme from secure backend...");

    // 1. Connect to your new Firebase Function
    const functions = getFunctions(undefined, 'europe-west2');
    const generateMandalaTheme = httpsCallable(functions, 'generateMandalaTheme');

    // 2. Call the function (instead of genAI.models.generateContent)
    // The backend now handles the model version (gemini-2.5-flash) and prompt construction.
    const result = await generateMandalaTheme({ prompt, seed });

    // 3. Extract the data
    // The backend returns { success: true, theme: ... } or throws an error
    const data = result.data as any;

    if (!data) {
      console.warn("Backend response was empty:", result);
      throw new Error("No data returned from backend");
    }

    // If your backend returns the theme directly (as in my previous example), use data.
    // If it wraps it (e.g. { theme: {...} }), adjust to data.theme.
    // Based on the code we wrote: it returns the raw JSON object directly.
    return data as Theme;

  } catch (error) {
    // This preserves your exact original error logging and fallback logic
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