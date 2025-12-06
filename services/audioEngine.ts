// ... (Keep Imports and Constants SCALES / CHORD_MODES exactly as they are) ...
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

export const CHORD_MODES: Record<string, number[]> = {
    'Single': [0],
    'Octaves': [0, 7], 
    'Triad (1-3-5)': [0, 2, 4], 
    'Sus4 (1-4-5)': [0, 3, 4],
    'Open 5th (1-5)': [0, 4],
    'Cluster (1-2)': [0, 1]
};

class Voice {
  // ... (Keep properties exactly as they are) ...
  public osc1: OscillatorNode;
  public osc2: OscillatorNode;
  public filter: BiquadFilterNode;
  public distortion: WaveShaperNode;
  public amp: GainNode;
  public lfo: OscillatorNode;
  public lfoGain: GainNode;
  public reverbSend: GainNode;
  
  private ctx: AudioContext;
  private config: SynthConfig;

  constructor(
    ctx: AudioContext, 
    destination: AudioNode, 
    reverbDestination: AudioNode,
    freq: number, 
    config: SynthConfig,
    activeEffects: string[]
  ) {
    this.ctx = ctx;
    this.config = config;
    const t = ctx.currentTime;

    // --- OSCILLATORS ---
    this.osc1 = ctx.createOscillator();
    this.osc1.type = config.osc1Type;
    this.osc1.frequency.value = freq;

    this.osc2 = ctx.createOscillator();
    this.osc2.type = config.osc2Type;
    this.osc2.frequency.value = freq; 
    this.osc2.detune.value = 5; 

    // --- LFO ---
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = config.vibratoSpeed;
    this.lfoGain = ctx.createGain();
    
    // START GENTLE: If vibrato is on, start at 0 and ramp up (The Cello Swell)
    this.lfoGain.gain.setValueAtTime(0, t);
    if (activeEffects.includes('vibrato')) {
        this.lfoGain.gain.setTargetAtTime(config.vibratoDepth * 5, t, 0.6); // 0.6s Fade In
    }
    
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.osc1.frequency);
    this.lfoGain.connect(this.osc2.frequency);
    this.lfo.start(t);

    // --- FILTER ---
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = config.filterQ;
    const targetFreq = activeEffects.includes('filter_close') ? 400 : config.filterFreq;
    
    this.filter.frequency.setValueAtTime(targetFreq, t);
    if (!activeEffects.includes('filter_close')) {
        this.filter.frequency.exponentialRampToValueAtTime(targetFreq * 0.5, t + config.decay);
    }

    // --- DISTORTION ---
    this.distortion = ctx.createWaveShaper();
    this.distortion.curve = activeEffects.includes('distort') ? this.makeDistortionCurve(50) : null;
    this.distortion.oversample = '4x';

    // --- AMP ---
    this.amp = ctx.createGain();
    this.amp.gain.setValueAtTime(0, t);
    this.amp.gain.linearRampToValueAtTime(0.5, t + config.attack); 
    this.amp.gain.exponentialRampToValueAtTime(config.sustain * 0.5, t + config.attack + config.decay);

    // --- REVERB SEND ---
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = activeEffects.includes('reverb_max') ? 0.8 : 0.0;

    // --- ROUTING ---
    this.osc1.connect(this.filter);
    this.osc2.connect(this.filter);
    this.filter.connect(this.distortion);
    this.distortion.connect(this.amp);
    this.amp.connect(destination); 
    this.amp.connect(this.reverbSend); 
    this.reverbSend.connect(reverbDestination); 

    this.osc1.start(t);
    this.osc2.start(t);
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

  public updateEffects(activeEffects: string[]) {
      const t = this.ctx.currentTime;
      
      const targetFreq = activeEffects.includes('filter_close') ? 400 : this.config.filterFreq;
      this.filter.frequency.setTargetAtTime(targetFreq, t, 0.1);

      this.distortion.curve = activeEffects.includes('distort') ? this.makeDistortionCurve(50) : null;

      this.reverbSend.gain.setTargetAtTime(activeEffects.includes('reverb_max') ? 0.8 : 0.0, t, 0.5);

      // FIXED: Slower ramp for Cello-like vibrato (0.6s)
      this.lfoGain.gain.setTargetAtTime(activeEffects.includes('vibrato') ? this.config.vibratoDepth * 5 : 0, t, 0.6);
  }

  public release() {
    const t = this.ctx.currentTime;
    const { release } = this.config;
    
    this.amp.gain.cancelScheduledValues(t);
    this.amp.gain.setValueAtTime(this.amp.gain.value, t);
    this.amp.gain.exponentialRampToValueAtTime(0.001, t + release);
    
    this.osc1.stop(t + release + 0.1);
    this.osc2.stop(t + release + 0.1);
    this.lfo.stop(t + release + 0.1);
    
    setTimeout(() => {
        this.osc1.disconnect();
        this.osc2.disconnect();
        this.filter.disconnect();
        this.distortion.disconnect();
        this.amp.disconnect();
        this.reverbSend.disconnect();
        this.lfo.disconnect();
        this.lfoGain.disconnect();
    }, (release + 0.2) * 1000);
  }
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  
  private activeVoices: Map<string, Voice> = new Map();

  public init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.4;

    this.compressor = this.ctx.createDynamicsCompressor();
    
    this.reverbNode = this.ctx.createConvolver();
    this.createImpulse(3, 2);

    this.reverbNode.connect(this.compressor);
    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
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

  public noteOn(userId: string, noteIndex: number, freq: number, config: SynthConfig, activeEffects: string[]) {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const id = `${userId}_${noteIndex}`;
    if (this.activeVoices.has(id)) {
        this.noteOff(userId, noteIndex);
    }

    const voice = new Voice(this.ctx, this.compressor!, this.reverbNode!, freq, config, activeEffects);
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

  public updateUserEffects(userId: string, activeEffects: string[]) {
    if (!this.ctx) return;
    
    this.activeVoices.forEach((voice, key) => {
        if (key.startsWith(`${userId}_`)) {
            voice.updateEffects(activeEffects);
        }
    });
  }
}

export const audioEngine = new AudioEngine();
