import { SynthConfig } from '../types';

export const SCALES: Record<string, number[]> = {
  'pentatonic_major': [0, 2, 4, 7, 9],
  'pentatonic_minor': [0, 3, 5, 7, 10],
  'major': [0, 2, 4, 5, 7, 9, 11],
  'minor': [0, 2, 3, 5, 7, 8, 10],
  'harmonic_minor': [0, 2, 3, 5, 7, 8, 11],
  'dorian': [0, 2, 3, 5, 7, 9, 10],
  'phrygian': [0, 1, 3, 5, 7, 8, 10],
  'lydian': [0, 2, 4, 6, 7, 9, 11],
  'mixolydian': [0, 2, 4, 5, 7, 9, 10],
  'locrian': [0, 1, 3, 5, 6, 8, 10],
  'whole_tone': [0, 2, 4, 6, 8, 10],
  'chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  'pelog': [0, 1, 3, 7, 8],
  'hirajoshi': [0, 2, 3, 7, 8]
};

class Voice {
  public osc1: OscillatorNode;
  public osc2: OscillatorNode;
  public filter: BiquadFilterNode;
  public amp: GainNode;
  public lfo: OscillatorNode;
  public lfoGain: GainNode;
  
  private ctx: AudioContext;
  private destination: AudioNode;
  private config: SynthConfig;

  constructor(ctx: AudioContext, destination: AudioNode, freq: number, config: SynthConfig) {
    this.ctx = ctx;
    this.destination = destination;
    this.config = config;
    const t = ctx.currentTime;

    // --- OSC 1 ---
    this.osc1 = ctx.createOscillator();
    this.osc1.type = config.osc1Type;
    this.osc1.frequency.value = freq;

    // --- OSC 2 ---
    this.osc2 = ctx.createOscillator();
    this.osc2.type = config.osc2Type;
    this.osc2.frequency.value = freq; 
    // Detune osc2 slightly for width
    this.osc2.detune.value = 5; 

    // --- LFO for Vibrato ---
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = config.vibratoSpeed;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0; // Starts at 0, modulated by expression
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.osc1.frequency);
    this.lfoGain.connect(this.osc2.frequency);
    this.lfo.start(t);

    // --- Filter ---
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = config.filterQ;
    this.filter.frequency.value = config.filterFreq;

    // Filter Envelope
    this.filter.frequency.setValueAtTime(config.filterFreq, t);
    this.filter.frequency.exponentialRampToValueAtTime(config.filterFreq * 0.5, t + config.decay);

    // --- Amp Envelope ---
    this.amp = ctx.createGain();
    this.amp.gain.setValueAtTime(0, t);
    this.amp.gain.linearRampToValueAtTime(0.5, t + config.attack); // Peak
    this.amp.gain.exponentialRampToValueAtTime(config.sustain * 0.5, t + config.attack + config.decay);

    // Connections
    this.osc1.connect(this.filter);
    this.osc2.connect(this.filter);
    this.filter.connect(this.amp);
    this.amp.connect(destination);

    this.osc1.start(t);
    this.osc2.start(t);
  }

  public release() {
    const t = this.ctx.currentTime;
    const { release } = this.config;
    
    // Prevent clicking if release is called before attack finishes
    this.amp.gain.cancelScheduledValues(t);
    this.amp.gain.setValueAtTime(this.amp.gain.value, t);
    this.amp.gain.exponentialRampToValueAtTime(0.001, t + release);
    
    this.osc1.stop(t + release + 0.1);
    this.osc2.stop(t + release + 0.1);
    this.lfo.stop(t + release + 0.1);
    
    // Clean up
    setTimeout(() => {
        this.osc1.disconnect();
        this.osc2.disconnect();
        this.filter.disconnect();
        this.amp.disconnect();
        this.lfo.disconnect();
        this.lfoGain.disconnect();
    }, (release + 0.2) * 1000);
  }

  public setVibrato(active: boolean) {
    const t = this.ctx.currentTime;
    // Ramp modulation depth
    this.lfoGain.gain.setTargetAtTime(active ? this.config.vibratoDepth * 5 : 0, t, 0.1);
  }
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbSend: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private distortionNode: WaveShaperNode | null = null;
  private distortionGain: GainNode | null = null;
  
  // Map<"userId_noteIndex", Voice>
  private activeVoices: Map<string, Voice> = new Map();

  public init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.4;

    this.compressor = this.ctx.createDynamicsCompressor();
    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 20000; // Open

    this.distortionNode = this.ctx.createWaveShaper();
    this.distortionNode.curve = this.makeDistortionCurve(50); // Reduced from 400 for less harshness
    this.distortionGain = this.ctx.createGain();
    this.distortionGain.gain.value = 0; // Start dry

    // Reverb
    this.reverbNode = this.ctx.createConvolver();
    this.createImpulse(3, 2);
    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0.05; // Default low reverb level

    // Chain: Voices -> Filter -> Distortion -> Compressor -> Master
    //              -> Reverb -> Master
    
    // Create a bus for voices to connect to
    const voiceBus = this.ctx.createGain();
    
    voiceBus.connect(this.filterNode);
    
    // Filter -> Compressor (Dry path)
    this.filterNode.connect(this.compressor);
    
    // Filter -> Distortion -> Compressor (Wet distortion path)
    this.filterNode.connect(this.distortionGain);
    this.distortionGain.connect(this.distortionNode);
    this.distortionNode.connect(this.compressor);

    this.compressor.connect(this.masterGain);

    // Reverb Send
    this.compressor.connect(this.reverbSend);
    this.reverbSend.connect(this.reverbNode);
    this.reverbNode.connect(this.masterGain);

    this.masterGain.connect(this.ctx.destination);
  }

  private makeDistortionCurve(amount: number) {
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = i * 2 / n_samples - 1;
      curve[i] = (3 + amount) * x * 20 * deg / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  private createImpulse(duration: number, decay: number) {
    if (!this.ctx || !this.reverbNode) return;
    const rate = this.ctx.sampleRate;
    const length = rate * duration;
    const impulse = this.ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
        const n = i;
        const e = Math.pow(1 - n / length, decay);
        left[i] = (Math.random() * 2 - 1) * e;
        right[i] = (Math.random() * 2 - 1) * e;
    }
    this.reverbNode.buffer = impulse;
  }

  public getFreq(base: number, scaleName: string, index: number): number {
    const scale = SCALES[scaleName] || SCALES['pentatonic_major'];
    const oct = Math.floor(index / scale.length);
    const degree = index % scale.length;
    const semitones = (oct * 12) + scale[degree];
    return base * Math.pow(2, semitones / 12);
  }

  public noteOn(userId: string, noteIndex: number, freq: number, config: SynthConfig) {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const id = `${userId}_${noteIndex}`;
    // If note exists, stop it first
    if (this.activeVoices.has(id)) {
        this.noteOff(userId, noteIndex);
    }

    // Connect to filter node (start of chain)
    const voice = new Voice(this.ctx, this.filterNode!, freq, config);
    this.activeVoices.set(id, voice);
  }

  public noteOff(userId: string, noteIndex: number) {
    const id = `${userId}_${noteIndex}`;
    const voice = this.activeVoices.get(id);
    if (voice) {
        voice.release();
        this.activeVoices.delete(id);
    }
  }

  public setEffect(type: string, active: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    
    // Apply effects either to master bus or individual active voices
    switch (type) {
        case 'reverb_max':
            // Slower ramp for reverb wash
            this.reverbSend?.gain.setTargetAtTime(active ? 1.0 : 0.05, t, 1.0);
            break;
        case 'filter_close': // Muffle
            this.filterNode?.frequency.setTargetAtTime(active ? 400 : 20000, t, 0.2);
            break;
        case 'distort': // Crunch
            this.distortionGain?.gain.setTargetAtTime(active ? 1.0 : 0.0, t, 0.1);
            break;
        case 'vibrato':
            this.activeVoices.forEach(v => v.setVibrato(active));
            break;
    }
  }
}

export const audioEngine = new AudioEngine();