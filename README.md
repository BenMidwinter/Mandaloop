Mandaloop: A Digital Transitional Space

Mandaloop is a browser-based, multiplayer generative synthesizer designed for remote therapeutic work. It creates a latency-free "shared instrument" where clinician and client can co-improvise in real-time.

Designed by an Advanced Clinical Practitioner (Music Therapy), it specifically addresses the needs of adolescents experiencing EBSA (Emotionally Based School Avoidance), offering a non-verbal, co-regulated environment for communication.

🧠 The Clinical Context
Remote music therapy often struggles with the "Latency Problem"—audio delays make synchronous playing impossible, turning sessions into turn-taking exercises rather than true dialogue. Mandaloop solves this by using State Synchronization instead of Audio Streaming.

Therapeutic Architecture

The app acts as a digital Transitional Space (Winnicott), balancing safety with individual expression:

The Container (Shared Reality): The musical Scale and the Synth Timbre (Theme) are synchronized globally. This ensures there are "no wrong notes," creating psychological safety and errorless learning.

Differentiation (Individual Voice): While the container is shared, effect processing (Distortion, Filter, Reverb) is isolated per user. A client can play a "Distorted" angry melody over a "Clean" grounding bassline provided by the therapist.

Externalization (AI Defusion): Integrated Generative AI (Gemini) allows clients to type complex emotional states (e.g., "Storm in a desert") and hear them translated into sound, externalizing internal feelings into a manipulable object.

🛠️ The Tech Stack (The Orchestra)
Mandaloop is a distributed real-time application composed of four parts:

The Architect (React + Vite): Handles the visual physics engine (The Mandala) and logic.

The Postman (Firebase Realtime Database): Handles the multiplayer networking. It syncs key presses, scale changes, and presence data instantly between clients.

The Instrument (Web Audio API): A custom-built Subtractive Synthesizer engine (audioEngine.ts) running locally in the browser. It features dual oscillators, LFO modulation, and per-voice effect chaining.

The Designer (Google Gemini 2.5): A Generative AI integration that interprets text prompts into synthesizer parameters (Attack, Decay, Filter Q, Waveforms) and color palettes.

🚀 Getting Started
Prerequisites

Node.js (v20+)

A Google Cloud Project (for Gemini API)

A Firebase Project

Installation

Clone the repository:

Bash
git clone https://github.com/your-username/mandaloop.git
cd mandaloop
Install dependencies:

Bash
npm install
Configure Environment: Create a .env.local file in the root directory and add your Gemini Key:

Code snippet
VITE_API_KEY=your_google_ai_studio_key_here
Run Locally:

Bash
npm run dev
🔑 Configuration & Secrets
1. Firebase (Multiplayer)

The Firebase configuration is located in src/services/commsService.ts.

If forking this repo, create a new Firebase project.

Enable Realtime Database.

Update the firebaseConfig object in commsService.ts with your own credentials.

Security Rules: Set rules to allow read/write.

2. Google Gemini (AI Generation)

The app uses Gemini 2.5 Flash.

Important: To prevent 403 Forbidden errors in production, you must set a Website Restriction in the Google Cloud Console Credentials.

Restrict the key to your domain: https://your-domain.app/*

🎹 Usage Guide
For the Clinician

Enter Room: Create a room code (e.g., ROOM1).

Share: Send the link and code to the client.

Set the Container: Use the "Instrument Config" to select a Scale (e.g., Pentatonic Minor).

Fine Tune: Use the controls to adjust Attack (urgency) or Release (calm).

Controls

Keys (Middle Row): S D F G H J K (Scale degrees 1-7)

Keys (Top Row): E R T Y U I O (Upper Octave)

Z (Hold): Low Pass Filter (Muffles sound)

X (Hold): Distortion (Adds grit/saturation)

C (Hold): Vibrato (Cello-style swell)

V (Toggle): Reverb (Toggle "Space")

📄 License
This project is open-source. Please credit the original author when adapting for clinical use.
