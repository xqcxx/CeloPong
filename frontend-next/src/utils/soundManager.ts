import { PUBLIC_URL } from '../constants';

class SoundManager {
  static buildPath(path) {
    if (!path) return '';
    // Keep audio assets working under subpaths (e.g., /pong-app/sounds/...)
    const base = PUBLIC_URL || '';
    if (!base) return path;
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${base.replace(/\/$/, '')}${normalizedPath}`;
  }

  basePath(path) {
    // Backwards compatibility for callers using instance method
    return SoundManager.buildPath(path);
  }

  createAudio(path) {
    const basePath = this.assetBase || PUBLIC_URL || '.'; // '.' keeps relative paths working
    const url = `${basePath.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
    if (!url) return null;
    try {
      return new Audio(url);
    } catch (error) {
      console.warn('Failed to create audio for', url, 'falling back to raw path');
      return new Audio(path);
    }
  }

  buildSounds() {
    this.hitSound = this.createAudio(this.soundPaths.hit);
    this.scoreSound = this.createAudio(this.soundPaths.score);
    this.loadSound = this.createAudio(this.soundPaths.load);
    this.gameOverSound = this.createAudio(this.soundPaths.gameOver);
    this.introSound = this.createAudio(this.soundPaths.intro);
    if (process?.env?.NODE_ENV !== 'production') {
      console.log('SoundManager loaded assets:', {
        hit: this.hitSound?.src,
        score: this.scoreSound?.src,
        load: this.loadSound?.src,
        gameOver: this.gameOverSound?.src,
        intro: this.introSound?.src,
      });
    }
  }

  getAssetBase() {
    return this.assetBase || '';
  }

  setAssetBase(base) {
    this.assetBase = base || '';
    this.buildSounds();
  }

  isAudioAvailable() {
    return Boolean(this.hitSound || this.scoreSound || this.loadSound || this.gameOverSound || this.introSound);
  }

  getSoundSources() {
    return {
      hit: this.hitSound?.src,
      score: this.scoreSound?.src,
      load: this.loadSound?.src,
      gameOver: this.gameOverSound?.src,
      intro: this.introSound?.src,
    };
  }

  constructor() {
    this.audioBase = PUBLIC_URL || '';
    if (this.audioBase) {
      console.log('SoundManager audio base:', this.audioBase);
    }
    this.soundPaths = {
      hit: '/sounds/hit2.mp3',       // relative to PUBLIC_URL
      score: '/sounds/score2.mp3',   // relative to PUBLIC_URL
      load: '/sounds/load2.mp3',     // relative to PUBLIC_URL
      gameOver: '/sounds/gameover3.mp3', // relative to PUBLIC_URL
      intro: '/sounds/intro2.mp3',   // relative to PUBLIC_URL
    };
    this.buildSounds();
    this.assetBase = SoundManager.buildPath('/sounds').replace(/\/sounds$/, '');
    if (this.assetBase) {
      console.log('SoundManager asset base:', this.assetBase);
    }
    
    this.audioContext = null;
    this.oscillators = [];
    this.gainNodes = [];
    this.rhythmIntervals = [];
    
    this.defaultGenome = "aslkajd asklja lskj ask aslkj aldka lskdjaslkdj ";
    
    this.isGenomeAudioPlaying = false;
    this.initialized = false;
  }

  init() {
    console.log('Initializing SoundManager');
    
    if (this.initialized) {
      console.log('Already initialized');
      return Promise.resolve();
    }
    
    return new Promise((resolve) => {
      try {
        // Create audio context if it doesn't exist
        if (!this.audioContext) {
          console.log('Creating new AudioContext');
          this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (this.audioContext.state === 'suspended') {
          console.log('AudioContext suspended, attempting to resume');
          this.audioContext.resume().catch(e => {
            console.warn('Could not resume audio context:', e);
          });
        }
        
        console.log('Audio context created:', this.audioContext.state);
        
        // Load audio files silently without playing them
        console.log('Loading audio files');
        
        // This prevents the "play() request was interrupted" error
        const silentBuffer = this.audioContext.createBuffer(1, 1, 22050);
        const silentSource = this.audioContext.createBufferSource();
        silentSource.buffer = silentBuffer;
        silentSource.connect(this.audioContext.destination);
        silentSource.start();
        
        this.initialized = true;
        console.log('Sound Manager initialized successfully');
        resolve();
      } catch (e) {
        console.error('Failed to initialize audio context:', e);
        this.initialized = false; // Mark as not initialized so we can try again
        resolve(); // Resolve anyway to avoid blocking
      }
    });
  }

  ensureAudioContext() {
    console.log('Ensuring audio context');
    
    if (!this.audioContext) {
      try {
        console.log('Creating new AudioContext');
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.error('Failed to create audio context:', e);
        return null;
      }
    }
    
    if (this.audioContext.state === 'suspended') {
      console.log('AudioContext suspended, attempting to resume');
      this.audioContext.resume().catch(e => {
        console.error('Failed to resume audio context:', e);
      });
    }
    
    console.log('Audio context state:', this.audioContext.state);
    return this.audioContext;
  }

  async playWithErrorHandling(playFunction, fallbackMessage = '') {
    try {
      if (!this.initialized) {
        await this.init();
      }
      
      // Ensure audio context is running
      this.ensureAudioContext();
      
      await playFunction();
    } catch (error) {
      console.warn(`Sound playback failed: ${fallbackMessage}`, error);
    }
  }

  startBackgroundMusic() {
    this.startGenomeAudio(this.defaultGenome);
  }

  startGenomeAudio(genome = null) {
    console.log('Starting genome audio, initialized:', this.initialized);
    if (!this.initialized) {
      console.log('Initializing sound manager before playing genome audio');
      return this.init().then(() => {
        this.isGenomeAudioPlaying = true; // Make sure to set this flag
        return this.createRhythmicSound(genome || this.defaultGenome);
      });
    }
    this.isGenomeAudioPlaying = true; // Explicitly set the flag
    return this.createRhythmicSound(genome || this.defaultGenome);
  }

  // Control maximum playback duration
  setMaxPlaybackDuration(durationMs = 30000, shouldAutoStop = false) {
    // Stop any existing timeout
    if (this.maxDurationTimeout) {
      clearTimeout(this.maxDurationTimeout);
      this.maxDurationTimeout = null;
    }
    
    // Only set the timeout if shouldAutoStop is true
    if (shouldAutoStop) {
      console.log(`Setting maximum playback duration: ${durationMs}ms`);
      this.maxDurationTimeout = setTimeout(() => {
        console.log(`Maximum playback duration (${durationMs}ms) reached, stopping sounds`);
        this.stopAll();
      }, durationMs);
    } else {
      console.log('Continuous playback enabled - no automatic stop');
    }
  }

  startSimpleGenomeAudio(genome = null) {
    this.isGenomeAudioPlaying = true; // Make sure the flag is set
    return this.createRhythmicSound(genome || this.defaultGenome);
  }

  createRhythmicSound(genome) {
    try {
      this.stopAll();
      
      console.log('AudioContext before ensuring:', this.audioContext ? this.audioContext.state : 'none');
      if (!this.ensureAudioContext()) {
        console.error('Failed to ensure audio context');
        return;
      }
      console.log('AudioContext after ensuring:', this.audioContext.state);
      
      // Make sure we set this flag early
      this.isGenomeAudioPlaying = true;
      
      console.log('Creating rhythmic sound with genome:', genome);
      
      const baseFreq = 80 + (Math.abs(this.hashCode(genome)) % 80);
      console.log('Base frequency:', baseFreq);
      
      const tempoFactor = 0.3 + (Math.abs(this.hashCode(genome.substring(0, 10))) % 0.2);
      const beatInterval = 300 * tempoFactor;
      console.log('Beat interval:', beatInterval);
      
      const mainSequence = this.generateLongerSequence(genome, 16);
      const bassSequence = this.generateLongerSequence(genome.split('').reverse().join(''), 12);
      const accentSequence = this.generateLongerSequence(genome.substring(5) + genome.substring(0, 5), 10);
      
      console.log('Main sequence length:', mainSequence.length);
      console.log('Bass sequence length:', bassSequence.length);
      console.log('Accent sequence length:', accentSequence.length);
      
      const patternLength = this.lcm(
        this.lcm(mainSequence.length, bassSequence.length), 
        accentSequence.length
      );
      
      console.log('Total pattern length (beats):', patternLength);
      console.log('Pattern duration (seconds):', (patternLength * beatInterval) / 1000);
      
      // Set maximum duration for the generated sound but DON'T auto-stop
      // Pass false as second parameter to indicate no auto-stop
      this.setMaxPlaybackDuration(30000, false);
      
      let currentBeat = 0;
      const mainRhythmInterval = setInterval(() => {
        // Debug log every 10 beats
        if (currentBeat % 10 === 0) {
          console.log('Main rhythm beat:', currentBeat, 'isPlaying:', this.isGenomeAudioPlaying);
        }
        
        if (!this.isGenomeAudioPlaying) {
          console.log('Stopping main rhythm - isPlaying flag false');
          clearInterval(mainRhythmInterval);
          return;
        }
        
        const mainIndex = currentBeat % mainSequence.length;
        const mainNote = mainSequence[mainIndex];
        
        if (mainNote.volume > 0) {
          this.playNote(
            baseFreq * mainNote.frequency, 
            mainNote.duration * beatInterval * 0.85,
            mainNote.volume,
            'triangle'
          );
        }
        
        currentBeat++;
      }, beatInterval);
      
      let bassBeat = 0;
      const bassRhythmInterval = setInterval(() => {
        if (!this.isGenomeAudioPlaying) {
          clearInterval(bassRhythmInterval);
          return;
        }
        
        const bassIndex = bassBeat % bassSequence.length;
        const bassNote = bassSequence[bassIndex];
        
        if (bassNote.volume > 0) {
          this.playNote(
            (baseFreq * 0.75) * bassNote.frequency, 
            bassNote.duration * beatInterval * 0.9,
            bassNote.volume * 1.2,
            'sine'
          );
        }
        
        bassBeat++;
      }, beatInterval * 1.5);
      
      let accentBeat = 0;
      const accentRhythmInterval = setInterval(() => {
        if (!this.isGenomeAudioPlaying) {
          clearInterval(accentRhythmInterval);
          return;
        }
        
        const accentIndex = accentBeat % accentSequence.length;
        const accentNote = accentSequence[accentIndex];
        
        if (accentNote.volume > 0.15) {
          this.playNote(
            baseFreq * 1.5 * accentNote.frequency,
            accentNote.duration * beatInterval * 0.4,
            accentNote.volume * 0.9,
            'square'
          );
        }
        
        accentBeat++;
      }, beatInterval * 2);
      
      this.rhythmIntervals.push(mainRhythmInterval, bassRhythmInterval, accentRhythmInterval);
      
      this.createBassDrone(baseFreq * 0.5);
      
      this.createRhythmicPercussion(beatInterval, genome, baseFreq);
      
      console.log('Faster rhythmic genome audio started successfully');
    } catch (error) {
      console.error('Error creating rhythmic sound:', error);
    }
  }

  generateLongerSequence(genome, length = 16) {
    const sequence = [];
    const possibleFrequencies = [0.5, 0.66, 0.75, 0.8, 1, 1.125, 1.25, 1.33, 1.5];
    
    let extendedGenome = genome;
    while (extendedGenome.length < length * 3) {
      extendedGenome += genome;
    }
    
    for (let i = 0; i < length * 2; i += 2) {
      if (i + 1 >= extendedGenome.length) break;
      
      const char1 = extendedGenome.charCodeAt(i % extendedGenome.length);
      const char2 = extendedGenome.charCodeAt((i + 1) % extendedGenome.length);
      const char3 = extendedGenome.charCodeAt((i + 2) % extendedGenome.length);
      
      const freqIndex = char1 % possibleFrequencies.length;
      const frequency = possibleFrequencies[freqIndex];
      
      const durationOptions = [0.5, 1, 1.5];
      const durIndex = char2 % durationOptions.length;
      const duration = durationOptions[durIndex];
      
      const volume = (char3 % 100) < 15 ? 0 : (0.1 + ((char1 + char2) % 25) / 100);
      
      sequence.push({ frequency, duration, volume });
      
      if (sequence.length >= length) break;
    }
    
    while (sequence.length < length) {
      sequence.push({ frequency: 1, duration: 1, volume: 0.2 });
    }
    
    return sequence;
  }

  playNote(frequency, duration, volume, waveType = 'triangle') {
    try {
      if (!this.audioContext) {
        console.error('No audio context available for playNote');
        return;
      }
      
      // Limit maximum duration of any single note to 3 seconds, but don't go below 100ms
      const maxDuration = Math.min(3000, Math.max(100, duration));
      
      // Use safer volume levels
      const safeVolume = Math.min(0.4, Math.max(0.05, volume));
      
      const osc = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      osc.type = waveType;
      osc.frequency.value = frequency;
      
      // Simpler gain envelope
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(safeVolume, this.audioContext.currentTime + 0.01);
      gainNode.gain.setValueAtTime(safeVolume, this.audioContext.currentTime + (maxDuration - 50) / 1000);
      gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + maxDuration / 1000);
      
      osc.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      console.log(`Playing note: freq=${frequency.toFixed(1)}, dur=${maxDuration}ms, vol=${safeVolume.toFixed(2)}`);
      
      const startTime = this.audioContext.currentTime;
      const stopTime = startTime + (maxDuration + 50) / 1000;
      
      osc.start(startTime);
      osc.stop(stopTime);
      
      osc.onended = () => {
        try {
          osc.disconnect();
          gainNode.disconnect();
        } catch (err) {
          // Already disconnected, ignore
        }
      };
      
      return { osc, gainNode };
    } catch (error) {
      console.error('Error playing note:', error);
      return null;
    }
  }

  createBassDrone(frequency) {
    try {
      if (!this.audioContext) return;
      
      const osc = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = frequency;
      
      // Start with low gain and ramp up for smoother transition
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.06, this.audioContext.currentTime + 1);
      
      // Keep constant volume after initial ramp-up instead of auto-stopping
      gainNode.gain.setValueAtTime(0.06, this.audioContext.currentTime + 20);
      
      osc.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      osc.start();
      
      // Don't schedule automatic stop - will be stopped when game ends
      
      this.oscillators.push(osc);
      this.gainNodes.push(gainNode);
      
      console.log('Bass drone created at frequency:', frequency);
    } catch (error) {
      console.error('Error creating bass drone:', error);
    }
  }

  createRhythmicPercussion(beatInterval, genome, baseFreq) {
    try {
      if (!this.audioContext) return;
      
      const frequencies = [
        baseFreq * 1,
        baseFreq * 1.5,
        baseFreq * 2,
        baseFreq * 2.5
      ];
      
      const detuneValues = [];
      for (let i = 0; i < 4; i++) {
        const startPos = i * 5;
        const genomeSlice = genome.substring(startPos, startPos + 5);
        const detune = Math.abs(this.hashCode(genomeSlice)) % 20 - 10;
        detuneValues.push(detune);
      }
      
      for (let i = 0; i < frequencies.length; i++) {
        const osc = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        osc.type = i % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.value = frequencies[i];
        osc.detune.value = detuneValues[i];
        
        // Start with lower gain and fade in
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.04 - (i * 0.005), this.audioContext.currentTime + 1);
        
        // Keep volume stable - don't schedule fadeout
        
        const lfo = this.audioContext.createOscillator();
        const lfoGain = this.audioContext.createGain();
        
        lfo.frequency.value = 0.05 + (i * 0.02);
        lfoGain.gain.value = 0.02;
        
        lfo.connect(lfoGain);
        lfoGain.connect(gainNode.gain);
        
        osc.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        osc.start();
        lfo.start();
        
        // Don't schedule automatic stops
        
        this.oscillators.push(osc, lfo);
        this.gainNodes.push(gainNode, lfoGain);
      }
      
      console.log('Evolving pad created for continuous playback');
    } catch (error) {
      console.error('Error creating evolving pad:', error);
    }
  }

  lcm(a, b) {
    return (a * b) / this.gcd(a, b);
  }

  gcd(a, b) {
    return b === 0 ? a : this.gcd(b, a % b);
  }

  stopAll() {
    // Clear any maximum duration timeout
    if (this.maxDurationTimeout) {
      clearTimeout(this.maxDurationTimeout);
      this.maxDurationTimeout = null;
    }
    
    if (this.oscillators && this.oscillators.length > 0) {
      console.log('Stopping', this.oscillators.length, 'oscillators');
      
      const currentTime = this.audioContext ? this.audioContext.currentTime : 0;
      
      for (let i = 0; i < this.oscillators.length; i++) {
        try {
          // If we have gain nodes, fade them out quickly
          if (this.gainNodes && this.gainNodes[i]) {
            try {
              this.gainNodes[i].gain.setValueAtTime(this.gainNodes[i].gain.value, currentTime);
              this.gainNodes[i].gain.linearRampToValueAtTime(0, currentTime + 0.1);
            } catch (e) {
              console.warn('Error fading out gain node:', e);
            }
          }
          
          // Schedule stop for the oscillator
          this.oscillators[i].stop(currentTime + 0.2);
          setTimeout(() => {
            try {
              this.oscillators[i].disconnect();
            } catch (e) {
              // Ignore - already disconnected
            }
          }, 250);
        } catch (e) {
          console.warn('Error stopping oscillator:', e);
        }
      }
      
      this.oscillators = [];
      this.gainNodes = [];
    }
    
    if (this.rhythmIntervals && this.rhythmIntervals.length > 0) {
      console.log('Clearing', this.rhythmIntervals.length, 'rhythm intervals');
      
      for (let i = 0; i < this.rhythmIntervals.length; i++) {
        clearInterval(this.rhythmIntervals[i]);
      }
      
      this.rhythmIntervals = [];
    }
    
    this.isGenomeAudioPlaying = false;
    
    try {
      this.hitSound?.pause();
      this.scoreSound?.pause();
      this.loadSound?.pause();
      this.gameOverSound?.pause();
      this.introSound?.pause();
    } catch (e) {
      console.warn('Error stopping sound effects:', e);
    }
  }

  stopGenomeAudio() {
    this.stopAll();
  }

  playHitSound() {
    return this.playWithErrorHandling(
      () => {
        if (!this.hitSound) return;
        this.hitSound.currentTime = 0;
        return this.hitSound.play()
          .catch(err => {
            console.warn('Hit sound playback error:', err);
            if (err.name === 'NotAllowedError') {
              // Needs user interaction - could show UI hint
              console.info('Audio playback requires user interaction first');
            }
            throw err; // Re-throw to be caught by playWithErrorHandling
          });
      },
      'Hit sound failed'
    );
  }

  playScoreSound() {
    return this.playWithErrorHandling(
      () => {
        if (!this.scoreSound) return;
        this.scoreSound.currentTime = 0;
        return this.scoreSound.play()
          .catch(err => {
            console.warn('Score sound playback error:', err);
            throw err;
          });
      },
      'Score sound failed'
    );
  }

  playLoadSound() {
    return this.playWithErrorHandling(
      () => {
        if (!this.loadSound) return;
        this.loadSound.currentTime = 0;
        return this.loadSound.play()
          .catch(err => {
            console.warn('Load sound playback error:', err);
            throw err;
          });
      },
      'Load sound failed'
    );
  }

  playGameOverSound() {
    return this.playWithErrorHandling(
      () => {
        if (!this.gameOverSound) return;
        this.gameOverSound.currentTime = 0;
        return this.gameOverSound.play()
          .catch(err => {
            console.warn('Game over sound playback error:', err);
            throw err;
          });
      },
      'Game over sound failed'
    );
  }

  playIntroSound() {
    return this.playWithErrorHandling(
      () => {
        if (!this.introSound) return;
        this.introSound.currentTime = 0;
        return this.introSound.play()
          .catch(err => {
            console.warn('Intro sound playback error:', err);
            throw err;
          });
      },
      'Intro sound failed'
    );
  }
  
  hashCode(str) {
    if (!str || str.length === 0) return 0;
    
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  initializeOnUserInteraction() {
    if (this.initialized) {
      console.log('Sound Manager already initialized');
      return Promise.resolve();
    }
    
    console.log('Initializing Sound Manager on user interaction');
    return this.init().then(() => {
      // Unlock audio context first
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      
      // Better approach: Create and play a silent audio buffer to unlock audio
      try {
        const buffer = this.audioContext.createBuffer(1, 1, 22050);
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        source.start(0);
        
        // Don't try to use play/pause for unlocking as it causes AbortError
        console.log('Audio context unlocked with buffer source');
        return Promise.resolve();
      } catch (e) {
        console.warn('Could not unlock audio context with buffer, falling back', e);
        return Promise.resolve();
      }
    });
  }
}

const soundManager = new SoundManager();
export default soundManager;
