/**
 * MIDSOMMER MADNESS - Game Logic
 * Implements a Swedish themed retro action arcade game.
 * Written using community game-development skills:
 * - Fixed timestep game loop.
 * - Input abstraction.
 * - Object pooling for particles and projectiles.
 * - Procedural Audio Synthesis via Web Audio API.
 * - Screen shake and polish effects.
 */

// Route unhandled JS errors in WebView to Firebase Crashlytics via Flutter bridge, chaining to the HTML crash reporter
const originalOnError = window.onerror;
window.onerror = function (message, source, lineno, colno, error) {
    if (typeof LeaderboardChannel !== 'undefined') {
        LeaderboardChannel.postMessage(JSON.stringify({
            type: 'recordError',
            message: String(message) + ' (at ' + String(source) + ':' + String(lineno) + ':' + String(colno) + ')',
            stack: error && error.stack ? String(error.stack) : ''
        }));
    }
    if (typeof originalOnError === 'function') {
        originalOnError(message, source, lineno, colno, error);
    }
};

// --- WEBASSEMBLY ENGINE LOADER & HELPER INTERFACE ---
let wasmExports = null;

async function initWasm() {
    try {
        console.log("Loading WebAssembly module...");
        let bytes;
        if (typeof WASM_BASE64 !== 'undefined' && WASM_BASE64) {
            console.log("Loading WASM from inline Base64 string...");
            const binaryString = atob(WASM_BASE64);
            const len = binaryString.length;
            const uint8 = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                uint8[i] = binaryString.charCodeAt(i);
            }
            bytes = uint8.buffer;
        } else {
            console.log("Loading WASM from local file fetch...");
            const response = await fetch('game_physics.wasm');
            if (!response.ok) throw new Error('WASM file not found');
            bytes = await response.arrayBuffer();
        }
        const obj = await WebAssembly.instantiate(bytes, {});
        wasmExports = obj.instance.exports;
        console.log("WebAssembly loaded successfully! Exports:", Object.keys(wasmExports));
    } catch (e) {
        console.error("Failed to load WebAssembly, using pure JavaScript fallback:", e);
    }
}

// Distance utility that utilizes WebAssembly or falls back to JS Math.hypot
function getDistance(x1, y1, x2, y2) {
    if (wasmExports && wasmExports.distance) {
        return wasmExports.distance(x1, y1, x2, y2);
    }
    return Math.hypot(x1 - x2, y1 - y2);
}

// Normalized vector utilities
function getNormalizedVectorX(dx, dy) {
    if (wasmExports && wasmExports.normalize_vector_x) {
        return wasmExports.normalize_vector_x(dx, dy);
    }
    const len = Math.hypot(dx, dy);
    return len === 0 ? 0 : dx / len;
}

function getNormalizedVectorY(dx, dy) {
    if (wasmExports && wasmExports.normalize_vector_y) {
        return wasmExports.normalize_vector_y(dx, dy);
    }
    const len = Math.hypot(dx, dy);
    return len === 0 ? 0 : dy / len;
}

function getEnemyParams(typeStr, lvlId) {
    if (lvlId === 5 || typeStr === "volvo") {
        return { typeIdx: 4, health: 200, size: 22, speed: 6.0 };
    }
    switch (typeStr) {
        case "shopper": return { typeIdx: 0, health: 45, size: 18, speed: 1.3 };
        case "drunkard": return { typeIdx: 1, health: 60, size: 18, speed: 1.1 };
        case "kid": return { typeIdx: 2, health: 40, size: 15, speed: 1.7 };
        case "zappafan": return { typeIdx: 3, health: 50, size: 18, speed: 1.2 };
        case "dalahorse": return { typeIdx: 5, health: 100, size: 24, speed: 1.4 };
        case "elk": return { typeIdx: 6, health: 120, size: 25, speed: 1.6 };
        case "guard": return { typeIdx: 7, health: 80, size: 20, speed: 1.4 };
        case "raver": return { typeIdx: 8, health: 65, size: 18, speed: 1.5 };
        case "abbabot": return { typeIdx: 9, health: 150, size: 22, speed: 1.2 };
        default: return { typeIdx: 0, health: 45, size: 18, speed: 1.3 };
    }
}

// Drop-in high performance Particle System using WebAssembly or JS
class ParticleSystem {
    constructor() {
        this.colors = [
            "red",                      // 0: blood / hits
            "orange",                   // 1: fire / spark
            "#ffd700",                  // 2: gold portal
            "white",                    // 3: general trails
            "rgba(240, 240, 240, 0.6)",  // 4: Elk nose steam
            "rgba(90, 74, 66, 0.4)",    // 5: Elk charging trail dust
            "rgba(139, 115, 85, 0.75)", // 6: Elk stomp dirt shockwave
            "rgba(255, 215, 0, 0.6)",   // 7: Sven speed boost trail / shield spark
            "rgba(120, 255, 120, 0.6)"  // 8: knackebrod / heal sparkles
        ];
        this.jsParticles = [];
    }

    clear() {
        if (wasmExports && wasmExports.clear_particles) {
            wasmExports.clear_particles();
        }
        this.colors = [
            "red",                      // 0: blood / hits
            "orange",                   // 1: fire / spark
            "#ffd700",                  // 2: gold portal
            "white",                    // 3: general trails
            "rgba(240, 240, 240, 0.6)",  // 4: Elk nose steam
            "rgba(90, 74, 66, 0.4)",    // 5: Elk charging trail dust
            "rgba(139, 115, 85, 0.75)", // 6: Elk stomp dirt shockwave
            "rgba(255, 215, 0, 0.6)",   // 7: Sven speed boost trail / shield spark
            "rgba(120, 255, 120, 0.6)"  // 8: knackebrod / heal sparkles
        ];
        this.jsParticles = [];
    }

    push(p) {
        if (wasmExports && wasmExports.spawn_particle) {
            let colorIdx = this.colors.indexOf(p.color);
            if (colorIdx === -1) {
                colorIdx = this.colors.length;
                this.colors.push(p.color);
            }
            wasmExports.spawn_particle(p.x, p.y, p.vx, p.vy, p.maxLife, p.size, colorIdx);
        } else {
            this.jsParticles.push(p);
        }
    }

    update(dt) {
        if (wasmExports && wasmExports.update_particles) {
            wasmExports.update_particles();
        } else {
            for (let i = this.jsParticles.length - 1; i >= 0; i--) {
                const p = this.jsParticles[i];
                p.update(dt);
                if (p.life <= 0) {
                    this.jsParticles.splice(i, 1);
                }
            }
        }
    }

    draw(ctx) {
        if (wasmExports && wasmExports.get_active_particles_count) {
            const count = wasmExports.get_active_particles_count();
            for (let i = 0; i < count; i++) {
                const x = wasmExports.get_particle_x(i);
                const y = wasmExports.get_particle_y(i);
                const size = wasmExports.get_particle_size(i);
                const life = wasmExports.get_particle_life(i);
                const maxLife = wasmExports.get_particle_max_life(i);
                const colorIdx = wasmExports.get_particle_color_idx(i);
                const color = this.colors[colorIdx] || "red";

                ctx.save();
                ctx.globalAlpha = life / maxLife;
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        } else {
            this.jsParticles.forEach(p => p.draw(ctx));
        }
    }
}

// --- AUDIO SYNTHESIS ENGINE (Web Audio API) ---
class SoundEffectsManager {
    constructor() {
        this.ctx = null;
        this.musicEnabled = true;
        this.sfxEnabled = true;
        
        // Sequencer variables for background music
        this.sequencerInterval = null;
        this.seqStep = 0;
        this.tempo = 140; // BPM
        this.currentScale = [130.81, 146.83, 164.81, 196.00, 220.00]; // C Pentatonic Major
    }

    init() {
        if (this.ctx) return;
        
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        
        this.ctx = new AudioContext();
        this.startSequencer();
    }

    toggleMusic() {
        this.musicEnabled = !this.musicEnabled;
        if (this.musicEnabled) {
            this.startSequencer();
        } else {
            this.stopSequencer();
        }
        return this.musicEnabled;
    }

    toggleSFX() {
        this.sfxEnabled = !this.sfxEnabled;
        return this.sfxEnabled;
    }

    // Play a procedurally generated synth note
    playSynthNote(freq, type = 'sine', duration = 0.2, volume = 0.1) {
        if (!this.ctx || !this.musicEnabled) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        
        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start();
        osc.stop(this.ctx.currentTime + duration);

        osc.onended = () => {
            osc.disconnect();
            gain.disconnect();
        };
    }

    // Play procedural sound effects
    playSFX(type) {
        if (!this.ctx || !this.sfxEnabled) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const now = this.ctx.currentTime;

        if (type === 'swing') {
            // Hockey stick swing - slide pitch up quickly on a triangle wave
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(now + 0.15);
            osc.onended = () => {
                osc.disconnect();
                gain.disconnect();
            };
        } 
        else if (type === 'hit') {
            // Melee hit - short noise-like explosion
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(120, now);
            osc.frequency.linearRampToValueAtTime(40, now + 0.1);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(now + 0.1);
            osc.onended = () => {
                osc.disconnect();
                gain.disconnect();
            };
        }
        else if (type === 'throw') {
            // Lobbing surstromming can - slide pitch down
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.25);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(now + 0.25);
            osc.onended = () => {
                osc.disconnect();
                gain.disconnect();
            };
        }
        else if (type === 'explode') {
            // Surstromming cloud explosion - low rumbling noise
            // Simulating noise with a low frequency square wave and slide
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(80, now);
            osc.frequency.linearRampToValueAtTime(10, now + 0.4);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(now + 0.45);
            osc.onended = () => {
                osc.disconnect();
                gain.disconnect();
            };
        }
        else if (type === 'powerup') {
            // Quick happy arpeggio for meatball/crispbread
            const notes = [261.63, 329.63, 392.00, 523.25]; // C major
            notes.forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + i * 0.06);
                gain.gain.setValueAtTime(0.12, now + i * 0.06);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.12);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now + i * 0.06);
                osc.stop(now + i * 0.06 + 0.12);
                osc.onended = () => {
                    osc.disconnect();
                    gain.disconnect();
                };
            });
        }
        else if (type === 'win') {
            // Celebratory folk fanfare
            const fanfare = [392.00, 392.00, 440.00, 392.00, 523.25, 493.88];
            const durations = [0.15, 0.15, 0.15, 0.15, 0.3, 0.4];
            let currentOffset = 0;
            fanfare.forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + currentOffset);
                gain.gain.setValueAtTime(0.15, now + currentOffset);
                gain.gain.exponentialRampToValueAtTime(0.001, now + currentOffset + durations[i]);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now + currentOffset);
                osc.stop(now + currentOffset + durations[i]);
                osc.onended = () => {
                    osc.disconnect();
                    gain.disconnect();
                };
                currentOffset += durations[i] - 0.02;
            });
        }
        else if (type === 'lose') {
            // Meltdown / Game Over sad chime
            const fanfare = [220.00, 207.65, 196.00, 164.81];
            fanfare.forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, now + i * 0.2);
                gain.gain.setValueAtTime(0.15, now + i * 0.2);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.2 + 0.4);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now + i * 0.2);
                osc.stop(now + i * 0.2 + 0.4);
                osc.onended = () => {
                    osc.disconnect();
                    gain.disconnect();
                };
            });
        }
    }

    startSequencer() {
        this.stopSequencer();
        if (!this.musicEnabled) return;
        
        const stepTime = 60 / this.tempo / 2; // Eighth notes
        this.sequencerInterval = setInterval(() => {
            this.tickSequencer();
        }, stepTime * 1000);
    }

    stopSequencer() {
        if (this.sequencerInterval) {
            clearInterval(this.sequencerInterval);
            this.sequencerInterval = null;
        }
    }

    // Set scales/tempos depending on current level to change atmosphere!
    setLevelAudioMode(levelNum) {
        if (levelNum === 1 || levelNum === 2) {
            this.tempo = 125;
            this.currentScale = [261.63, 293.66, 329.63, 392.00, 440.00]; // C Major folk
        } else if (levelNum === 3) {
            this.tempo = 150;
            this.currentScale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25]; // Hyper C Major candy rush
        } else if (levelNum === 4) {
            this.tempo = 140;
            this.currentScale = [146.83, 164.81, 174.61, 196.00, 220.00, 261.63]; // D Dorian (Zappa-esque jazz-rock)
        } else if (levelNum === 5) {
            this.tempo = 155;
            this.currentScale = [164.81, 196.00, 220.00, 293.66, 329.63]; // E minor (fast highway rock)
        } else if (levelNum === 6) {
            this.tempo = 110;
            this.currentScale = [220.00, 246.94, 261.63, 329.63, 392.00]; // A minor (mysterious forest)
        } else if (levelNum === 7) {
            this.tempo = 115;
            this.currentScale = [220.00, 246.94, 293.66, 329.63, 392.00]; // A minor pentatonic (tense forest run)
        } else if (levelNum === 8) {
            this.tempo = 135;
            this.currentScale = [110.00, 123.47, 130.81, 146.83, 164.81, 196.00]; // Low heavy E/A minor (brooding prison metal)
        } else if (levelNum === 9) {
            this.tempo = 128; // Classic EDM BPM
            this.currentScale = [220.00, 246.94, 261.63, 293.66, 329.63, 392.00, 440.00]; // A minor pentatonic / C major
        } else if (levelNum === 10) {
            this.tempo = 120; // Classic Disco BPM
            this.currentScale = [130.81, 164.81, 196.00, 220.00, 261.63, 311.13]; // C minor disco/funk
        }
        
        // Restart sequencer to apply tempo changes immediately
        if (this.musicEnabled) {
            this.startSequencer();
        }
    }

    tickSequencer() {
        if (!this.ctx || !this.musicEnabled) return;
        
        const step = this.seqStep % 8;
        const lvlId = (typeof game !== 'undefined' && game) ? (game.currentLevelIndex + 1) : 1;
        
        if (lvlId === 8) {
            // KVINNAFÄNGELSET Heavy Industrial Metal track
            // Heavy thrashing kick
            if (step % 2 === 0) {
                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(90, now);
                osc.frequency.linearRampToValueAtTime(30, now + 0.15);
                gain.gain.setValueAtTime(0.4, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(now + 0.15);
                osc.onended = () => {
                    osc.disconnect();
                    gain.disconnect();
                };
            }
            
            // Industrial metallic hi-hat/snare
            if (step === 2 || step === 6) {
                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(180, now);
                gain.gain.setValueAtTime(0.25, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(now + 0.18);
                osc.onended = () => {
                    osc.disconnect();
                    gain.disconnect();
                };
            }
            
            // Metal guitar chug riff sequence (low distortion sound)
            const riff = [110.00, 110.00, 146.83, 110.00, 164.81, 110.00, 130.81, 123.47];
            this.playSynthNote(riff[step], 'sawtooth', 0.18, 0.13);
            
            this.seqStep++;
            return;
        }

        if (lvlId === 9) {
            // AVICII RAVE EDM Track (Levels Hook)
            // Pounding Four-on-the-floor kick
            if (step === 0 || step === 2 || step === 4 || step === 6) {
                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(140, now);
                osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.12);
                gain.gain.setValueAtTime(0.35, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(now + 0.12);
                osc.onended = () => {
                    osc.disconnect();
                    gain.disconnect();
                };
            }
            
            // Offbeat hi-hat
            if (step === 1 || step === 3 || step === 5 || step === 7) {
                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(8000, now);
                gain.gain.setValueAtTime(0.015, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(now + 0.05);
                osc.onended = () => {
                    osc.disconnect();
                    gain.disconnect();
                };
            }
            
            // Avicii melody hook: C#5 - E5 - F#5 - G#5 - F#5 - E5 - C#5 - B4
            const melody = [554.37, 659.25, 739.99, 830.61, 739.99, 659.25, 554.37, 493.88];
            this.playSynthNote(melody[step], 'sawtooth', 0.22, 0.09);
            
            // Sub bassline
            const bass = [138.59, 164.81, 185.00, 207.65, 185.00, 164.81, 138.59, 123.47];
            this.playSynthNote(bass[step], 'triangle', 0.24, 0.14);
            
            this.seqStep++;
            return;
        }
        
        if (lvlId === 10) {
            // ABBA DISCO Track (Gimme! Gimme! Gimme! Hook)
            // Pounding disco kick
            if (step === 0 || step === 2 || step === 4 || step === 6) {
                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(130, now);
                osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.15);
                gain.gain.setValueAtTime(0.35, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(now + 0.15);
                osc.onended = () => {
                    osc.disconnect();
                    gain.disconnect();
                };
            }
            
            // Offbeat hi-hat
            if (step === 1 || step === 3 || step === 5 || step === 7) {
                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(9000, now);
                gain.gain.setValueAtTime(0.018, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(now + 0.06);
                osc.onended = () => {
                    osc.disconnect();
                    gain.disconnect();
                };
            }
            
            // ABBA melody hook: D5 - C5 - D5 - F5 - D5 - C5 - D5 - A5
            const melody = [587.33, 523.25, 587.33, 698.46, 587.33, 523.25, 587.33, 880.00];
            this.playSynthNote(melody[step], 'sine', 0.2, 0.07);
            
            // Disco octave bassline (D3 on beats, D4 on offbeats)
            const bassFreq = (step % 2 === 0) ? 146.83 : 293.66;
            this.playSynthNote(bassFreq, 'sawtooth', 0.18, 0.06);
            
            this.seqStep++;
            return;
        }
        
        // DEFAULT FOLK SEQUENCER (Levels 1, 2, 3, 4, 5)
        // Bassline synth
        let note = null;
        if (step === 0 || step === 4) {
            note = this.currentScale[0] / 2; // Root bass note
        } else if (step === 2 || step === 6) {
            note = this.currentScale[2] / 2;
        } else if (step === 7) {
            note = this.currentScale[1] / 2;
        }
        
        if (note) {
            this.playSynthNote(note, 'triangle', 0.2, 0.12);
        }

        // Melody trigger
        if (step === 0 && Math.random() > 0.4) {
            const randNote = this.currentScale[Math.floor(Math.random() * this.currentScale.length)];
            this.playSynthNote(randNote, 'sine', 0.15, 0.06);
        } else if (step === 3 && Math.random() > 0.6) {
            const randNote = this.currentScale[Math.floor(Math.random() * this.currentScale.length)] * 2;
            this.playSynthNote(randNote, 'sine', 0.1, 0.05);
        } else if (step === 5 && Math.random() > 0.7) {
            const randNote = this.currentScale[Math.floor(Math.random() * this.currentScale.length)];
            this.playSynthNote(randNote, 'sine', 0.2, 0.05);
        }
        
        // Retro Hi-Hat (short noise bursts on 2 and 6)
        if (step === 2 || step === 6) {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(10000, now);
            gain.gain.setValueAtTime(0.012, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(now + 0.04);
            osc.onended = () => {
                osc.disconnect();
                gain.disconnect();
            };
        }

        this.seqStep++;
    }
}

const sounds = new SoundEffectsManager();


// --- GAME ENGINE ---

// Screen Shake variables
let shakeIntensity = 0;
let shakeDecay = 0.08;

function triggerScreenShake(intensity) {
    shakeIntensity = intensity;
}

// Level configurations
const levels = [
    {
        id: 1,
        title: "IKEA WAREHOUSE",
        description: "Dodge the flatpack-carrying shoppers. Find meatballs to restore energy!",
        colors: { bg: "#006aa7", grid: "#ffcc00", wall: "#004875" },
        enemyType: "shopper",
        enemiesToDefeat: 5,
        targetScore: 1000
    },
    {
        id: 2,
        title: "SYSTEMBOLAGET",
        description: "The state liquor store is packed with thirsty Swedes throwing glass bottles!",
        colors: { bg: "#2d3748", grid: "#4a5568", wall: "#1a202c" },
        enemyType: "drunkard",
        enemiesToDefeat: 6,
        targetScore: 2500
    },
    {
        id: 3,
        title: "LÖRDAGSGODIS",
        description: "Sugar rush Saturday! Dodge hyperactive, strung-out Swedish kids throwing sweet candy projectiles!",
        colors: { bg: "#5d1c3a", grid: "#ed64a6", wall: "#361022" },
        enemyType: "kid",
        enemiesToDefeat: 7,
        targetScore: 4500
    },
    {
        id: 4,
        title: "THE SWEDISH PUB",
        description: "Zappa fans are singing 'Bobby Brown' karaoke. Watch out for flying musical notes!",
        colors: { bg: "#4a3b32", grid: "#5c4a3e", wall: "#2d221b" },
        enemyType: "zappafan",
        enemiesToDefeat: 7,
        targetScore: 7000
    },
    {
        id: 5,
        title: "VOLVO HIGHWAY",
        description: "Svenska racing! Speeding Volvos zoom across lanes. Cross safely, combat is optional!",
        colors: { bg: "#718096", grid: "#a0aec0", wall: "#4a5568" },
        enemyType: "volvo",
        enemiesToDefeat: 0, // survival-based crossing
        targetScore: 10000
    },
    {
        id: 6,
        title: "DALARNA FOREST",
        description: "Deep in the Swedish woods, giant wooden Dalarna Horses charge at Sven in sudden dash-bursts!",
        colors: { bg: "#276749", grid: "#2f855a", wall: "#1c4530" },
        enemyType: "dalahorse",
        enemiesToDefeat: 8,
        targetScore: 13500
    },
    {
        id: 7,
        title: "ALLEMANSRÄTTEN",
        description: "Swedish right to roam! Harvest wild cloudberries while dodging aggressive elk charging and stomping!",
        colors: { bg: "#2b4c2a", grid: "#8fbc8f", wall: "#193318" },
        enemyType: "elk",
        enemiesToDefeat: 8,
        targetScore: 17500
    },
    {
        id: 8,
        title: "KVINNAFÄNGELSET",
        description: "Escape the Swedish women's prison! Dodging strict guards throwing heavy metal handcuffs.",
        colors: { bg: "#4a5568", grid: "#cbd5e0", wall: "#2d3748" },
        enemyType: "guard",
        enemiesToDefeat: 8,
        targetScore: 22000
    },
    {
        id: 9,
        title: "AVICII RAVE",
        description: "Dance and dodge through neon-glowing ravers under strobes. Avicii's melodies fill the air!",
        colors: { bg: "#120524", grid: "#ec4899", wall: "#0d031a" },
        enemyType: "raver",
        enemiesToDefeat: 8,
        targetScore: 27000
    },
    {
        id: 10,
        title: "ABBA DISCO",
        description: "The grand finale! Evil metallic ABBA Bots shoot spinning laser balls. Dance your way to the Maypole!",
        colors: { bg: "#2b0a3d", grid: "#6b21a8", wall: "#1f032e" },
        enemyType: "abbabot",
        enemiesToDefeat: 10,
        targetScore: 33000
    }
];

class Game {
    constructor() {
        this.canvas = document.getElementById("gameCanvas");
        this.ctx = this.canvas.getContext("2d");
        
        // Game States
        this.states = {
            TITLE: 0,
            INTRO: 1,
            PLAYING: 2,
            GAMEOVER: 3,
            VICTORY: 4
        };
        this.currentState = this.states.TITLE;
        
        // Timestep setup (Fixed update rate)
        this.lastTime = 0;
        this.fpsTarget = 60;
        this.timestep = 1000 / this.fpsTarget;
        this.accumulator = 0;
        
        // Timer limits
        this.levelTimerLimit = 65; // Seconds per level (race against sundown)
        this.levelTimer = this.levelTimerLimit;
        
        // Input system state
        this.inputs = {
            moveUp: false,
            moveDown: false,
            moveLeft: false,
            moveRight: false,
            attackMelee: false,
            attackRanged: false,
            joystickX: 0,
            joystickY: 0
        };
        
        // Mouse tracking (for aiming)
        this.mousePos = { x: 0, y: 0 };
        
        // Reset player object placeholders
        this.player = null;
        
        // Level management
        this.currentLevelIndex = 0;
        this.enemiesDefeatedThisLevel = 0;
        this.portalActive = false;
        this.levelCompleted = false;

        // Statistics across the run
        this.meatballsCollected = 0;
        this.horsesDefeated = 0;
        
        // Object pools & lists (avoid GC thrashing)
        this.enemies = [];
        this.projectiles = [];
        this.particles = new ParticleSystem();
        this.items = [];
        this.exitPortal = null;
        this.maypole = null;
        
        // WASM-reused entity caches to prevent GC thrashing & reset animations
        this.wasmEnemiesCache = [];
        this.wasmProjectilesCache = [];
        this.wasmItemsCache = [];
        
        // Timing tracking
        this.sundownTimerInterval = null;
        
        this.setupEventHandlers();
        this.initHighScores();
    }

    // --- SETUP ---
    
    setupEventHandlers() {
        // Keyboard Inputs
        window.addEventListener("keydown", (e) => this.handleKeyboard(e, true));
        window.addEventListener("keyup", (e) => this.handleKeyboard(e, false));
        
        // Mouse Coordinates
        this.canvas.addEventListener("mousemove", (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mousePos.x = (e.clientX - rect.left) * (this.canvas.width / (rect.width || 1));
            this.mousePos.y = (e.clientY - rect.top) * (this.canvas.height / (rect.height || 1));
        });
        
        // Mouse clicks (melee / ranged)
        this.canvas.addEventListener("mousedown", (e) => {
            sounds.init(); // Initialize audio context on first user gesture
            if (this.currentState !== this.states.PLAYING) return;
            
            if (e.button === 0) {
                this.inputs.attackMelee = true;
            } else if (e.button === 2) {
                this.inputs.attackRanged = true;
            }
        });

        // Prevent right click context menu on the canvas
        this.canvas.addEventListener("contextmenu", (e) => {
            e.preventDefault();
        });

        // --- MOBILE TOUCH CONTROLS ---

        // Canvas touch-aiming (outside joystick and buttons zones)
        const handleCanvasTouch = (e) => {
            if (e.touches.length === 0) return;
            // Get first touch not in joystick zone or action zone
            for (let i = 0; i < e.touches.length; i++) {
                const touch = e.touches[i];
                if (touch.target.closest("#mobileControls")) continue;
                
                const rect = this.canvas.getBoundingClientRect();
                this.mousePos.x = (touch.clientX - rect.left) * (this.canvas.width / (rect.width || 1));
                this.mousePos.y = (touch.clientY - rect.top) * (this.canvas.height / (rect.height || 1));
                
                if (this.player) {
                    const dx = this.mousePos.x - this.player.x;
                    const dy = this.mousePos.y - this.player.y;
                    this.player.angle = Math.atan2(dy, dx);
                }
                break;
            }
        };

        this.canvas.addEventListener("touchstart", (e) => {
            sounds.init();
            if (this.currentState !== this.states.PLAYING) return;
            handleCanvasTouch(e);
        }, { passive: true });

        this.canvas.addEventListener("touchmove", (e) => {
            if (this.currentState !== this.states.PLAYING) return;
            handleCanvasTouch(e);
        }, { passive: true });

        // Virtual Joystick setup
        const joystickZone = document.getElementById("joystickZone");
        const joystickBase = document.getElementById("joystickBase");
        const joystickStick = document.getElementById("joystickStick");
        
        if (joystickZone && joystickBase && joystickStick) {
            let activeTouchId = null;
            let centerX = 0;
            let centerY = 0;
            const maxRadius = 40; // Max displacement in pixels
            
            const handleJoystickTouchStart = (e) => {
                sounds.init();
                const rect = joystickZone.getBoundingClientRect();
                for (let i = 0; i < e.targetTouches.length; i++) {
                    const touch = e.targetTouches[i];
                    if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
                        touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
                        activeTouchId = touch.identifier;
                        
                        const baseRect = joystickBase.getBoundingClientRect();
                        centerX = baseRect.left + baseRect.width / 2;
                        centerY = baseRect.top + baseRect.height / 2;
                        
                        updateJoystick(touch.clientX, touch.clientY);
                        break;
                    }
                }
            };
            
            const handleJoystickTouchMove = (e) => {
                if (activeTouchId === null) return;
                for (let i = 0; i < e.touches.length; i++) {
                    const touch = e.touches[i];
                    if (touch.identifier === activeTouchId) {
                        updateJoystick(touch.clientX, touch.clientY);
                        break;
                    }
                }
            };
            
            const handleJoystickTouchEnd = (e) => {
                if (activeTouchId === null) return;
                let touchFound = false;
                for (let i = 0; i < e.touches.length; i++) {
                    if (e.touches[i].identifier === activeTouchId) {
                        touchFound = true;
                        break;
                    }
                }
                if (!touchFound) {
                    activeTouchId = null;
                    resetJoystick();
                }
            };
            
            const updateJoystick = (touchX, touchY) => {
                let dx = touchX - centerX;
                let dy = touchY - centerY;
                const dist = Math.hypot(dx, dy);
                
                if (dist > maxRadius) {
                    dx = (dx / dist) * maxRadius;
                    dy = (dy / dist) * maxRadius;
                }
                
                joystickStick.style.transform = `translate(${dx}px, ${dy}px)`;
                
                const normX = dx / maxRadius;
                const normY = dy / maxRadius;
                
                const threshold = 0.25;
                this.inputs.moveLeft = normX < -threshold;
                this.inputs.moveRight = normX > threshold;
                this.inputs.moveUp = normY < -threshold;
                this.inputs.moveDown = normY > threshold;
                this.inputs.joystickX = normX;
                this.inputs.joystickY = normY;
                
                // Set Sven's aiming direction in the direction of movement by default
                if (this.player && (this.inputs.moveLeft || this.inputs.moveRight || this.inputs.moveUp || this.inputs.moveDown)) {
                    const moveAngle = Math.atan2(normY, normX);
                    this.player.angle = moveAngle;
                    // Position target virtual cursor out front so surstromming points correctly
                    this.mousePos.x = this.player.x + Math.cos(moveAngle) * 150;
                    this.mousePos.y = this.player.y + Math.sin(moveAngle) * 150;
                }
            };
            
            const resetJoystick = () => {
                joystickStick.style.transform = "translate(0px, 0px)";
                this.inputs.moveLeft = false;
                this.inputs.moveRight = false;
                this.inputs.moveUp = false;
                this.inputs.moveDown = false;
                this.inputs.joystickX = 0;
                this.inputs.joystickY = 0;
            };
            
            joystickZone.addEventListener("touchstart", handleJoystickTouchStart, { passive: true });
            window.addEventListener("touchmove", handleJoystickTouchMove, { passive: false });
            window.addEventListener("touchend", handleJoystickTouchEnd, { passive: true });
            window.addEventListener("touchcancel", handleJoystickTouchEnd, { passive: true });
        }

        // Action Buttons
        const btnMelee = document.getElementById("btnMobileMelee");
        const btnRanged = document.getElementById("btnMobileRanged");
        
        if (btnMelee) {
            btnMelee.addEventListener("touchstart", (e) => {
                e.preventDefault();
                sounds.init();
                if (this.currentState === this.states.PLAYING) {
                    this.inputs.attackMelee = true;
                }
            });
        }
        
        if (btnRanged) {
            btnRanged.addEventListener("touchstart", (e) => {
                e.preventDefault();
                sounds.init();
                if (this.currentState === this.states.PLAYING) {
                    this.inputs.attackRanged = true;
                }
            });
        }
        
        // HTML UI Button bindings
        document.getElementById("startGameBtn").addEventListener("click", () => {
            sounds.init();
            this.changeState(this.states.INTRO);
        });
        
        document.getElementById("howToPlayBtn").addEventListener("click", () => {
            sounds.init();
            document.getElementById("screenTutorial").classList.add("active");
        });
        
        document.getElementById("closeTutorialBtn").addEventListener("click", () => {
            document.getElementById("screenTutorial").classList.remove("active");
        });
        
        document.getElementById("startLevelBtn").addEventListener("click", () => {
            this.startLevel();
        });
        
        document.getElementById("retryGameBtn").addEventListener("click", () => {
            this.currentLevelIndex = 0;
            this.changeState(this.states.INTRO);
        });
        
        document.getElementById("restartGameBtn").addEventListener("click", () => {
            this.currentLevelIndex = 0;
            this.changeState(this.states.INTRO);
        });
        
        // High Score Submissions
        document.getElementById("saveScoreBtnGameOver").addEventListener("click", () => {
            const input = document.getElementById("playerNameInputGameOver");
            const name = input.value.trim() || "SVEN";
            const score = this.player ? this.player.score : 0;
            this.saveScore(name, score);
            document.getElementById("gameOverScoreInputRow").style.display = "none";
        });

        document.getElementById("saveScoreBtnVictory").addEventListener("click", () => {
            const input = document.getElementById("playerNameInputVictory");
            const name = input.value.trim() || "SVEN";
            const totalScore = this.player ? this.player.score + Math.floor(this.levelTimer * 100) : 0;
            this.saveScore(name, totalScore);
            document.getElementById("victoryScoreInputRow").style.display = "none";
        });
        
        // Mute controls
        const soundBtn = document.getElementById("soundToggleBtn");
        soundBtn.addEventListener("click", () => {
            sounds.init();
            const enabled = sounds.toggleMusic();
            soundBtn.innerHTML = `<span class="btn-icon">🔊</span> Music: ${enabled ? 'ON' : 'OFF'}`;
            soundBtn.blur();
        });

        const sfxBtn = document.getElementById("sfxToggleBtn");
        sfxBtn.addEventListener("click", () => {
            sounds.init();
            const enabled = sounds.toggleSFX();
            sfxBtn.innerHTML = `<span class="btn-icon">💥</span> SFX: ${enabled ? 'ON' : 'OFF'}`;
            sfxBtn.blur();
        });

        // Initialize and bind responsive sizing
        this.resizeGame();
        window.addEventListener("resize", () => this.resizeGame());
        window.addEventListener("load", () => this.resizeGame());
    }

    resizeGame() {
        const wrapper = document.querySelector(".canvas-wrapper");
        if (!wrapper) return;

        const isMobile = document.documentElement.classList.contains("android-app") || window.innerWidth < 900;
        
        if (isMobile) {
            const targetWidth = 800;
            const targetHeight = 500;
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            
            const scaleX = windowWidth / targetWidth;
            const scaleY = windowHeight / targetHeight;
            const scale = Math.min(scaleX, scaleY);
            
            wrapper.style.transform = `scale(${scale})`;
            wrapper.style.transformOrigin = "center center";
            wrapper.style.position = "absolute";
            wrapper.style.left = "50%";
            wrapper.style.top = "50%";
            wrapper.style.marginLeft = `-${targetWidth / 2}px`;
            wrapper.style.marginTop = `-${targetHeight / 2}px`;
        } else {
            wrapper.style.transform = "";
            wrapper.style.transformOrigin = "";
            wrapper.style.position = "";
            wrapper.style.left = "";
            wrapper.style.top = "";
            wrapper.style.marginLeft = "";
            wrapper.style.marginTop = "";
        }
    }

    handleKeyboard(e, isPressed) {
        // Map keyboard controls to game actions
        switch (e.code) {
            case "KeyW":
            case "ArrowUp":
                this.inputs.moveUp = isPressed;
                break;
            case "KeyS":
            case "ArrowDown":
                this.inputs.moveDown = isPressed;
                break;
            case "KeyA":
            case "ArrowLeft":
                this.inputs.moveLeft = isPressed;
                break;
            case "KeyD":
            case "ArrowRight":
                this.inputs.moveRight = isPressed;
                break;
            case "Space":
                this.inputs.attackRanged = isPressed;
                break;
            case "KeyE":
            case "KeyF":
                this.inputs.attackMelee = isPressed;
                break;
        }
    }

    initHighScores() {
        // Expose a global callback so Flutter can return scores
        window.onScoresLoaded = (scoresData) => {
            try {
                const scores = typeof scoresData === 'string' ? JSON.parse(scoresData) : scoresData;
                this.renderHighScores(scores);
            } catch (e) {
                console.error("Error loading scores:", e);
            }
        };

        // Also expose a readiness listener
        window.onFlutterBridgeReady = () => {
            this.fetchScores();
        };

        this.fetchScores();
    }

    fetchScores() {
        if (typeof LeaderboardChannel !== 'undefined') {
            LeaderboardChannel.postMessage(JSON.stringify({ type: 'getScores' }));
        } else {
            // Seed some scores locally if none exist (standalone web mode)
            if (!localStorage.getItem("midsommerScores")) {
                const defaults = [
                    { name: "Sven The Great", score: 15000 },
                    { name: "Björn Ironfist", score: 12400 },
                    { name: "Linus Torvalds", score: 9800 },
                    { name: "Freja Bloom", score: 7500 },
                    { name: "Surströmming Fan", score: 4500 }
                ];
                localStorage.setItem("midsommerScores", JSON.stringify(defaults));
            }
            const localScores = JSON.parse(localStorage.getItem("midsommerScores")) || [];
            this.renderHighScores(localScores);
        }
    }

    saveScore(playerName, finalScore) {
        if (typeof LeaderboardChannel !== 'undefined') {
            LeaderboardChannel.postMessage(JSON.stringify({ 
                type: 'saveScore', 
                name: playerName, 
                score: finalScore 
            }));
        } else {
            // Standalone web mode fallback
            const scores = JSON.parse(localStorage.getItem("midsommerScores")) || [];
            scores.push({ name: playerName, score: finalScore });
            scores.sort((a, b) => b.score - a.score);
            localStorage.setItem("midsommerScores", JSON.stringify(scores.slice(0, 10)));
            this.renderHighScores(scores);
        }
    }

    renderHighScores(scoresList) {
        const scores = scoresList || [];
        const tbody = document.getElementById("leaderboardBody");
        if (!tbody) return;
        tbody.innerHTML = "";
        
        const rankLabels = ["1st", "2nd", "3rd", "4th", "5th"];
        scores.slice(0, 5).forEach((s, idx) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${rankLabels[idx] || (idx + 1) + 'th'}</td>
                <td>${s.name}</td>
                <td>${String(s.score).padStart(6, '0')}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    checkIsHighScore(score) {
        try {
            const tbody = document.getElementById("leaderboardBody");
            if (!tbody) return true;
            const rows = tbody.getElementsByTagName("tr");
            // If leaderboard has empty slots
            if (rows.length < 5) return true;
            
            // Get the score of the 5th place
            const lastRow = rows[rows.length - 1];
            if (lastRow) {
                const lastScoreCell = lastRow.getElementsByTagName("td")[2];
                if (lastScoreCell) {
                    const lastScore = parseInt(lastScoreCell.innerText, 10);
                    return !isNaN(lastScore) ? score > lastScore : true;
                }
            }
            return true;
        } catch (e) {
            console.error("Error in checkIsHighScore:", e);
            if (typeof LeaderboardChannel !== 'undefined') {
                LeaderboardChannel.postMessage(JSON.stringify({
                    type: 'recordError',
                    message: e.message || 'Error in checkIsHighScore',
                    stack: e.stack || ''
                }));
            }
            return true;
        }
    }

    // --- STATE MANAGER ---
    
    logEvent(name, params) {
        if (typeof LeaderboardChannel !== 'undefined') {
            LeaderboardChannel.postMessage(JSON.stringify({
                type: 'logEvent',
                name: name,
                parameters: params || {}
            }));
        }
    }
    
    changeState(newState) {
        this.currentState = newState;
        
        // Hide all overlays
        const overlays = document.querySelectorAll(".screen-overlay");
        overlays.forEach(o => o.classList.remove("active"));
        
        if (newState === this.states.TITLE) {
            document.getElementById("screenTitle").classList.add("active");
            this.stopTimer();
            sounds.setLevelAudioMode(1);
            this.logEvent('view_title_screen');
        } 
        else if (newState === this.states.INTRO) {
            const currentLevel = levels[this.currentLevelIndex];
            
            document.getElementById("introLevelNum").innerText = `LEVEL ${currentLevel.id}`;
            document.getElementById("introLevelTitle").innerText = currentLevel.title;
            document.getElementById("introLevelDesc").innerText = currentLevel.description;
            
            document.getElementById("screenIntro").classList.add("active");
            this.stopTimer();
            sounds.setLevelAudioMode(currentLevel.id);
            this.updateSidebarIndicators();
            this.logEvent('level_start', { level_id: currentLevel.id, level_title: currentLevel.title });
        } 
        else if (newState === this.states.PLAYING) {
            // Screen handles canvas gameplay, overlays are hidden
            this.startTimer();
            const currentLevel = levels[this.currentLevelIndex];
            this.logEvent('level_playing', { level_id: currentLevel.id });
        } 
        else if (newState === this.states.GAMEOVER) {
            try {
                const screen = document.getElementById("screenGameOver");
                if (screen) screen.classList.add("active");
                
                const score = this.player ? this.player.score : 0;
                const statEndLevel = document.getElementById("statEndLevel");
                if (statEndLevel) statEndLevel.innerText = levels[this.currentLevelIndex].title;
                const statEndScore = document.getElementById("statEndScore");
                if (statEndScore) statEndScore.innerText = score;
                const statEndMeatballs = document.getElementById("statEndMeatballs");
                if (statEndMeatballs) statEndMeatballs.innerText = this.meatballsCollected;
                
                // Reset screen shake on Game Over
                shakeIntensity = 0;
                
                // Check if user reached high score, show input if they did
                const inputRow = document.getElementById("gameOverScoreInputRow");
                if (inputRow) {
                    if (score > 0 && this.checkIsHighScore(score)) {
                        inputRow.style.display = "flex";
                    } else {
                        inputRow.style.display = "none";
                    }
                }
                
                this.stopTimer();
                sounds.playSFX('lose');
                const currentLevel = levels[this.currentLevelIndex];
                this.logEvent('game_over', { 
                    level_id: currentLevel.id, 
                    score: score, 
                    meatballs: this.meatballsCollected 
                });
            } catch (e) {
                console.error("Error in GAMEOVER state transition:", e);
                if (typeof LeaderboardChannel !== 'undefined') {
                    LeaderboardChannel.postMessage(JSON.stringify({
                        type: 'recordError',
                        message: e.message || 'Error in GAMEOVER transition',
                        stack: e.stack || ''
                    }));
                }
                // Stop timer regardless to prevent loops
                this.stopTimer();
            }
        } 
        else if (newState === this.states.VICTORY) {
            try {
                const screen = document.getElementById("screenVictory");
                if (screen) screen.classList.add("active");
                
                const totalScore = this.player ? this.player.score + Math.floor(this.levelTimer * 100) : 0;
                const statWinScore = document.getElementById("statWinScore");
                if (statWinScore) statWinScore.innerText = totalScore;
                const statWinTime = document.getElementById("statWinTime");
                if (statWinTime) statWinTime.innerText = `${Math.floor(this.levelTimer)}s`;
                const statWinHorses = document.getElementById("statWinHorses");
                if (statWinHorses) statWinHorses.innerText = this.horsesDefeated;
                
                // Reset screen shake on Victory
                shakeIntensity = 0;
                
                // Check if user reached high score, show input if they did
                const inputRow = document.getElementById("victoryScoreInputRow");
                if (inputRow) {
                    if (totalScore > 0 && this.checkIsHighScore(totalScore)) {
                        inputRow.style.display = "flex";
                    } else {
                        inputRow.style.display = "none";
                    }
                }
                
                this.stopTimer();
                sounds.playSFX('win');
                const currentLevel = levels[this.currentLevelIndex];
                this.logEvent('level_victory', { 
                    level_id: currentLevel.id, 
                    total_score: totalScore, 
                    time_left: Math.floor(this.levelTimer), 
                    horses_defeated: this.horsesDefeated 
                });
            } catch (e) {
                console.error("Error in VICTORY state transition:", e);
                if (typeof LeaderboardChannel !== 'undefined') {
                    LeaderboardChannel.postMessage(JSON.stringify({
                        type: 'recordError',
                        message: e.message || 'Error in VICTORY transition',
                        stack: e.stack || ''
                    }));
                }
                // Stop timer regardless
                this.stopTimer();
            }
        }
    }

    startTimer() {
        this.stopTimer();
        this.levelTimer = this.levelTimerLimit;
        document.getElementById("hudTimer").innerText = `${Math.floor(this.levelTimer)}s`;
        
        this.sundownTimerInterval = setInterval(() => {
            if (this.currentState === this.states.PLAYING) {
                this.levelTimer -= 1;
                
                // Keep UI updated
                const timerElem = document.getElementById("hudTimer");
                timerElem.innerText = `${Math.max(0, Math.floor(this.levelTimer))}s`;
                
                // Color transition from yellow to red as sundown approaches
                if (this.levelTimer < 20) {
                    timerElem.style.color = "hsl(0, 100%, 50%)";
                    timerElem.style.textShadow = "0 0 15px rgba(255, 0, 0, 0.8)";
                } else if (this.levelTimer < 40) {
                    timerElem.style.color = "hsl(35, 100%, 50%)";
                    timerElem.style.textShadow = "0 0 10px rgba(255, 165, 0, 0.6)";
                } else {
                    timerElem.style.color = "var(--accent-red)";
                    timerElem.style.textShadow = "var(--accent-red-glow)";
                }
                
                if (this.levelTimer <= 0) {
                    this.changeState(this.states.GAMEOVER);
                }
            }
        }, 1000);
    }

    stopTimer() {
        if (this.sundownTimerInterval) {
            clearInterval(this.sundownTimerInterval);
            this.sundownTimerInterval = null;
        }
    }

    // --- GAMEPLAY INITIALIZATION ---
    
    startLevel() {
        const lvl = levels[this.currentLevelIndex];
        
        // Reset state
        this.enemiesDefeatedThisLevel = 0;
        this.portalActive = false;
        this.levelCompleted = false;
        
        // Initialize Lists
        this.enemies = [];
        this.projectiles = [];
        this.particles.clear();
        this.items = [];
        this.exitPortal = null;
        this.maypole = null;
        
        // Clear WASM-reused entity caches on level start
        this.wasmEnemiesCache = [];
        this.wasmProjectilesCache = [];
        this.wasmItemsCache = [];
        
        // Set up Sven
        const startX = 60;
        const startY = this.canvas.height / 2;
        if (this.currentLevelIndex === 0 || !this.player) {
            this.player = new Sven(startX, startY);
            this.meatballsCollected = 0;
            this.horsesDefeated = 0;
        } else {
            // Keep stats across levels
            this.player.x = startX;
            this.player.y = startY;
            this.player.health = Math.min(100, this.player.health + 30); // partial heal between levels
            this.player.ammo = 3; // reload surstromming
        }
        
        if (wasmExports && wasmExports.init_level_wasm) {
            wasmExports.init_level_wasm(this.currentLevelIndex);
            
            // Sync player stats to WASM if continuing
            if (this.currentLevelIndex > 0) {
                wasmExports.set_player_x(this.player.x);
                wasmExports.set_player_y(this.player.y);
                wasmExports.set_player_health(this.player.health);
                wasmExports.set_player_surstromming(this.player.ammo);
                wasmExports.set_player_score(this.player.score);
            }
        }
        
        // Update header UI
        document.getElementById("currentLevelName").innerText = `LEVEL ${lvl.id}: ${lvl.title}`;
        
        // Spawn Exit Gate or Maypole
        if (lvl.id === 10) {
            this.maypole = new Maypole(720, this.canvas.height / 2);
        } else {
            this.exitPortal = new ExitPortal(740, this.canvas.height / 2);
        }
        
        // Initial Enemy Spawn
        let initialEnemyCount = 3;
        if (lvl.id === 5) initialEnemyCount = 0; // highway has lanes spawning dynamically
        
        for (let i = 0; i < initialEnemyCount; i++) {
            this.spawnEnemy();
        }
        
        // Spawn initial food items
        this.spawnFoodItem(true);  // meatball
        this.spawnFoodItem(false); // knackebrod
        
        this.changeState(this.states.PLAYING);
        
        // Restart loop
        this.lastTime = performance.now();
        this.accumulator = 0;
    }

    spawnEnemy() {
        const lvl = levels[this.currentLevelIndex];
        
        // Choose position: offscreen or right side
        let x = this.canvas.width + 50;
        let y = Math.random() * (this.canvas.height - 100) + 50;
        
        if (wasmExports && wasmExports.spawn_enemy_wasm) {
            let enemyTypeStr = lvl.enemyType;
            if (lvl.id === 5) {
                const laneIndex = Math.floor(Math.random() * 4);
                const laneY = 130 + laneIndex * 80;
                const dir = Math.random() > 0.5 ? 1 : -1;
                x = dir === 1 ? -60 : this.canvas.width + 60;
                const params = getEnemyParams("volvo", lvl.id);
                wasmExports.spawn_enemy_wasm(x, laneY, params.typeIdx, params.health, params.size, params.speed);
            } else {
                const params = getEnemyParams(enemyTypeStr, lvl.id);
                wasmExports.spawn_enemy_wasm(x, y, params.typeIdx, params.health, params.size, params.speed);
            }
            return;
        }
        
        if (lvl.id === 5) {
            // Highway level - Volvos spawn at left/right edges of specific lanes
            const laneIndex = Math.floor(Math.random() * 4);
            const laneY = 130 + laneIndex * 80;
            const dir = Math.random() > 0.5 ? 1 : -1;
            x = dir === 1 ? -60 : this.canvas.width + 60;
            this.enemies.push(new VolvoCar(x, laneY, dir));
            return;
        }
        
        switch (lvl.enemyType) {
            case "shopper":
                this.enemies.push(new Shopper(x, y));
                break;
            case "drunkard":
                this.enemies.push(new Drunkard(x, y));
                break;
            case "kid":
                this.enemies.push(new CandyKid(x, y));
                break;
            case "zappafan":
                this.enemies.push(new ZappaFan(x, y));
                break;
            case "dalahorse":
                this.enemies.push(new DalarnaHorse(x, y));
                break;
            case "elk":
                this.enemies.push(new Elk(x, y));
                break;
            case "guard":
                this.enemies.push(new Guard(x, y));
                break;
            case "raver":
                this.enemies.push(new Raver(x, y));
                break;
            case "abbabot":
                this.enemies.push(new ABBAbot(x, y));
                break;
        }
    }

    spawnFoodItem(isMeatball) {
        const x = Math.random() * (this.canvas.width - 250) + 150;
        const y = Math.random() * (this.canvas.height - 100) + 50;
        
        if (wasmExports && wasmExports.spawn_item_wasm) {
            const itemType = isMeatball ? 0 : 1;
            wasmExports.spawn_item_wasm(x, y, itemType);
            return;
        }
        
        if (isMeatball) {
            this.items.push(new MeatballItem(x, y));
        } else {
            this.items.push(new KnackebrodItem(x, y));
        }
    }

    // --- GAME ENGINE TIMESTEP LOOPS ---
    
    run(timestamp) {
        if (!this.lastTime) this.lastTime = timestamp;
        let elapsed = timestamp - this.lastTime;
        this.lastTime = timestamp;
        
        // Cap frame time to prevent spiraling
        if (elapsed > 250) elapsed = 250;
        
        this.accumulator += elapsed;
        
        while (this.accumulator >= this.timestep) {
            if (this.currentState === this.states.PLAYING) {
                this.update(this.timestep);
            }
            this.accumulator -= this.timestep;
        }
        
        this.render();
        
        requestAnimationFrame((t) => this.run(t));
    }

    // --- SYSTEM UPDATE LOGIC ---
    
    update(dt) {
        if (wasmExports && wasmExports.update_game_wasm) {
            const lvl = levels[this.currentLevelIndex];
            
            // 1. Convert dt to seconds (dt is in milliseconds, e.g. 16.67)
            const dtSec = dt / 1000.0;
            
            // 2. Map input bitmask
            const keys_bitmask = (this.inputs.moveUp ? 1 : 0) |
                                 (this.inputs.moveDown ? 2 : 0) |
                                 (this.inputs.moveLeft ? 4 : 0) |
                                 (this.inputs.moveRight ? 8 : 0);
            
            const attack_melee = this.inputs.attackMelee && !(this.player && this.player.isSwinging);
            const attack_ranged = this.inputs.attackRanged;
            
            // Reset input triggers
            this.inputs.attackMelee = false;
            this.inputs.attackRanged = false;
            
            // 3. Call WASM Game Update
            wasmExports.update_game_wasm(
                keys_bitmask,
                this.inputs.joystickX || 0.0,
                this.inputs.joystickY || 0.0,
                this.mousePos.x || 0.0,
                this.mousePos.y || 0.0,
                attack_melee,
                attack_ranged,
                dtSec
            );
            
            // 4. Extract and Play sound events from WASM
            const sound_count = wasmExports.get_sound_event_count();
            for (let i = 0; i < sound_count; i++) {
                const sound_id = wasmExports.get_sound_event(i);
                if (sound_id === 1) { // swing
                    sounds.playSFX('swing');
                    if (this.player) {
                        this.player.isSwinging = true;
                        this.player.swingTimer = 0;
                    }
                } else if (sound_id === 2) { // throw
                    sounds.playSFX('throw');
                } else if (sound_id === 3) { // hit
                    sounds.playSFX('hit');
                    triggerScreenShake(4);
                    // Spawn hit particles
                    if (this.player) {
                        for (let p=0; p<8; p++) {
                            this.particles.push(new Particle(
                                this.player.x, this.player.y,
                                (Math.random()-0.5)*4, (Math.random()-0.5)*4,
                                "red", 12
                            ));
                        }
                    }
                } else if (sound_id === 4) { // explode
                    sounds.playSFX('explode');
                    triggerScreenShake(5);
                } else if (sound_id === 5) { // powerup
                    sounds.playSFX('powerup');
                } else if (sound_id === 6) { // win
                    sounds.playSFX('win');
                } else if (sound_id === 7) { // lose
                    sounds.playSFX('lose');
                }
            }
            wasmExports.clear_sound_events();
            
            // 5. Update Maypole or Portal animations in JS
            if (lvl.id === 10) {
                if (this.maypole) this.maypole.update(dt);
            } else {
                if (this.exitPortal) this.exitPortal.update(dt);
            }
            
            // 6. Spawning dynamics and item keeping are now natively simulated inside the WASM update loop!
            
            // 7. Sync Level State & Check Portal activation
            const wasmPortalActive = wasmExports.is_portal_active_wasm();
            if (!this.portalActive && wasmPortalActive) {
                this.portalActive = true;
                if (this.exitPortal) this.exitPortal.activate();
                // Confetti particles
                for (let i = 0; i < 30; i++) {
                    this.particles.push(new Particle(
                        this.canvas.width - 60,
                        this.canvas.height / 2,
                        (Math.random() - 0.5) * 5,
                        (Math.random() - 0.5) * 5,
                        "hsl(" + (Math.random() * 60 + 200) + ", 100%, 60%)",
                        25
                    ));
                }
            }
            
            this.levelTimer = wasmExports.get_level_timer_wasm();
            this.enemiesDefeatedThisLevel = wasmExports.get_enemies_defeated_wasm();
            this.meatballsCollected = wasmExports.get_meatballs_collected();
            this.horsesDefeated = wasmExports.get_horses_defeated();
            this.levelCompleted = wasmExports.is_level_completed_wasm();
            
            if (wasmExports.is_game_over_wasm()) {
                this.changeState(this.states.GAMEOVER);
                return;
            }
            
            // 8. Synchronize Entities back to JS presenters
            // Sven Player
            if (this.player) {
                this.player.x = wasmExports.get_player_x();
                this.player.y = wasmExports.get_player_y();
                this.player.health = wasmExports.get_player_health();
                this.player.maxHealth = wasmExports.get_player_max_health();
                this.player.ammo = wasmExports.get_player_surstromming();
                this.player.score = wasmExports.get_player_score();
                this.player.angle = wasmExports.get_player_angle();
                this.player.damageCooldown = wasmExports.get_player_cooldown() * 1000.0;
                this.player.speedBoostActive = wasmExports.get_player_speed_boost_active();
                this.player.shieldActive = wasmExports.get_player_shield_active();
                
                // Progress visual melee swing timer
                if (this.player.isSwinging) {
                    this.player.swingTimer += dt;
                    if (this.player.swingTimer >= this.player.swingDuration) {
                        this.player.isSwinging = false;
                        this.player.swingTimer = 0;
                    }
                }
            }
            
            // Enemies
            const maxEnemies = wasmExports.get_enemies_max_count();
            const newEnemies = [];
            for (let i = 0; i < maxEnemies; i++) {
                if (wasmExports.get_enemy_active(i)) {
                    const ex = wasmExports.get_enemy_x(i);
                    const ey = wasmExports.get_enemy_y(i);
                    const typeIdx = wasmExports.get_enemy_type(i);
                    const health = wasmExports.get_enemy_health(i);
                    const size = wasmExports.get_enemy_size(i);
                    const angle = wasmExports.get_enemy_angle(i);
                    
                    let enemyObj = this.wasmEnemiesCache[i];
                    let match = false;
                    if (enemyObj) {
                        if (typeIdx === 0 && enemyObj instanceof Shopper) match = true;
                        else if (typeIdx === 1 && enemyObj instanceof Drunkard) match = true;
                        else if (typeIdx === 2 && enemyObj instanceof CandyKid) match = true;
                        else if (typeIdx === 3 && enemyObj instanceof ZappaFan) match = true;
                        else if (typeIdx === 4 && enemyObj instanceof VolvoCar) match = true;
                        else if (typeIdx === 5 && enemyObj instanceof DalarnaHorse) match = true;
                        else if (typeIdx === 6 && enemyObj instanceof Elk) match = true;
                        else if (typeIdx === 7 && enemyObj instanceof Guard) match = true;
                        else if (typeIdx === 8 && enemyObj instanceof Raver) match = true;
                        else if (typeIdx === 9 && enemyObj instanceof ABBAbot) match = true;
                    }
                    if (!match) {
                        switch (typeIdx) {
                            case 0: enemyObj = new Shopper(ex, ey); break;
                            case 1: enemyObj = new Drunkard(ex, ey); break;
                            case 2: enemyObj = new CandyKid(ex, ey); break;
                            case 3: enemyObj = new ZappaFan(ex, ey); break;
                            case 4: enemyObj = new VolvoCar(ex, ey, (ex < 640 ? 1 : -1)); break;
                            case 5: enemyObj = new DalarnaHorse(ex, ey); break;
                            case 6: enemyObj = new Elk(ex, ey); break;
                            case 7: enemyObj = new Guard(ex, ey); break;
                            case 8: enemyObj = new Raver(ex, ey); break;
                            case 9: enemyObj = new ABBAbot(ex, ey); break;
                            default: enemyObj = new Shopper(ex, ey); break;
                        }
                        this.wasmEnemiesCache[i] = enemyObj;
                    }
                    enemyObj.x = ex;
                    enemyObj.y = ey;
                    enemyObj.health = health;
                    enemyObj.angle = angle;
                    enemyObj.width = size * 2;
                    enemyObj.height = size * 2;
                    
                    // Retrieve state, stateTimer, and velocities from Rust engine
                    const state = wasmExports.get_enemy_state(i);
                    const stateTimer = wasmExports.get_enemy_state_timer(i);
                    const evx = wasmExports.get_enemy_vx(i);
                    const evy = wasmExports.get_enemy_vy(i);
                    
                    enemyObj.vx = evx;
                    enemyObj.vy = evy;
                    
                    if (typeIdx === 6) { // Elk
                        enemyObj.state = (state === 0 ? "walk" : state === 1 ? "prep" : state === 2 ? "charge" : "stomp");
                        enemyObj.chargeVx = evx;
                        enemyObj.chargeVy = evy;
                        enemyObj.stompRadius = 10.0 + (0.5 - stateTimer) * 180.0;
                        enemyObj.prepFlash = (0.8 - stateTimer) * 1000.0;
                    } else if (typeIdx === 5) { // Dalarna Horse
                        enemyObj.isDashing = (state === 1);
                        enemyObj.dashVx = evx;
                        enemyObj.dashVy = evy;
                    }
                    
                    newEnemies.push(enemyObj);
                } else {
                    this.wasmEnemiesCache[i] = null;
                }
            }
            this.enemies = newEnemies;
            
            // Projectiles
            const maxProjectiles = wasmExports.get_projectiles_max_count();
            const newProjectiles = [];
            for (let i = 0; i < maxProjectiles; i++) {
                if (wasmExports.get_projectile_active(i)) {
                    const px = wasmExports.get_projectile_x(i);
                    const py = wasmExports.get_projectile_y(i);
                    const typeIdx = wasmExports.get_projectile_type(i);
                    const size = wasmExports.get_projectile_size(i);
                    
                    let projObj = this.wasmProjectilesCache[i];
                    let match = false;
                    if (projObj) {
                        if (typeIdx === 0 && projObj instanceof SurstrommingCan) match = true;
                        else if (typeIdx === 1 && projObj instanceof FlatpackBox) match = true;
                        else if (typeIdx === 2 && projObj instanceof GasCloud) match = true;
                        else if (typeIdx === 3 && projObj instanceof Bottle) match = true;
                        else if (typeIdx === 4 && projObj instanceof MusicNote) match = true;
                        else if (typeIdx === 5 && projObj instanceof LaserBall) match = true;
                        else if (typeIdx === 6 && projObj instanceof Glowstick) match = true;
                        else if (typeIdx === 7 && projObj instanceof Handcuffs) match = true;
                        else if (typeIdx === 8 && projObj instanceof Lordagsgodis) match = true;
                    }
                    if (!match) {
                        switch (typeIdx) {
                            case 0: projObj = new SurstrommingCan(px, py, 0, 0, 100); break;
                            case 1: projObj = new FlatpackBox(px, py, 0, 0); break;
                            case 2: projObj = new GasCloud(px, py); break;
                            case 3: projObj = new Bottle(px, py, 0, 0); break;
                            case 4: projObj = new MusicNote(px, py, 0, 0); break;
                            case 5: projObj = new LaserBall(px, py, 0, 0); break;
                            case 6: projObj = new Glowstick(px, py, 0, 0); break;
                            case 7: projObj = new Handcuffs(px, py, 0, 0); break;
                            case 8: projObj = new Lordagsgodis(px, py, 0, 0); break;
                            default: projObj = new SurstrommingCan(px, py, 0, 0, 100); break;
                        }
                        this.wasmProjectilesCache[i] = projObj;
                    }
                    projObj.x = px;
                    projObj.y = py;
                    projObj.width = size * 2;
                    projObj.height = size * 2;
                    if (projObj.rotation !== undefined) {
                        projObj.rotation += 0.15;
                    }
                    newProjectiles.push(projObj);
                } else {
                    this.wasmProjectilesCache[i] = null;
                }
            }
            this.projectiles = newProjectiles;
            
            // Items
            const maxItems = wasmExports.get_items_max_count();
            const newItems = [];
            for (let i = 0; i < maxItems; i++) {
                if (wasmExports.get_item_active(i)) {
                    const ix = wasmExports.get_item_x(i);
                    const iy = wasmExports.get_item_y(i);
                    const typeIdx = wasmExports.get_item_type(i);
                    
                    let itemObj = this.wasmItemsCache[i];
                    if (!itemObj || (typeIdx === 0 && itemObj.type !== "meatball") || (typeIdx !== 0 && itemObj.type !== "knackebrod")) {
                        if (typeIdx === 0) {
                            itemObj = new MeatballItem(ix, iy);
                        } else {
                            itemObj = new KnackebrodItem(ix, iy);
                        }
                        this.wasmItemsCache[i] = itemObj;
                    }
                    itemObj.x = ix;
                    itemObj.y = iy;
                    newItems.push(itemObj);
                } else {
                    this.wasmItemsCache[i] = null;
                }
            }
            this.items = newItems;
            
            // 9. Update Particles
            this.particles.update(dt);
            
            // 10. Level transition portals check
            if (this.portalActive) {
                if (lvl.id === 10) {
                    if (this.checkCollision(this.player, this.maypole)) {
                        this.changeState(this.states.VICTORY);
                    }
                } else {
                    if (this.checkCollision(this.player, this.exitPortal)) {
                        this.progressLevel();
                    }
                }
            }
            
            // 11. Shake decay
            if (shakeIntensity > 0) {
                shakeIntensity -= shakeDecay;
            } else {
                shakeIntensity = 0;
            }
            
            this.updateHUD();
            return; // Early return to bypass pure JS simulation!
        }
        
        const lvl = levels[this.currentLevelIndex];
        
        // 1. Update Player
        this.player.update(dt, this.inputs, this.mousePos, this.canvas);
        
        // Regenerate surstromming over time (every 5 seconds)
        if (this.player.ammo < 3) {
            this.player.ammoRegenTimer += dt;
            if (this.player.ammoRegenTimer >= 5000) {
                this.player.ammo++;
                this.player.ammoRegenTimer = 0;
            }
        }
        
        // Trigger Player Attacks
        if (this.inputs.attackMelee) {
            this.player.meleeSwing(this.enemies, this.mousePos);
            this.inputs.attackMelee = false;
        }
        if (this.inputs.attackRanged) {
            if (this.player.ammo > 0) {
                this.player.throwSurstromming(this.mousePos, this.projectiles);
                this.player.ammo--;
                sounds.playSFX('throw');
            }
            this.inputs.attackRanged = false;
        }
        
        // Update exit structures
        if (lvl.id === 10) {
            this.maypole.update(dt);
        } else {
            this.exitPortal.update(dt);
        }
        
        // 2. Check for portal activation
        if (!this.portalActive && lvl.id !== 5 && this.enemiesDefeatedThisLevel >= lvl.enemiesToDefeat) {
            this.portalActive = true;
            if (this.exitPortal) this.exitPortal.activate();
            // Spawn some confetti or portal unlock particles
            for (let i = 0; i < 30; i++) {
                this.particles.push(new Particle(
                    this.canvas.width - 60, 
                    this.canvas.height / 2, 
                    (Math.random() - 0.5) * 5, 
                    (Math.random() - 0.5) * 5, 
                    "hsl(" + (Math.random() * 60 + 200) + ", 100%, 60%)", 
                    25
                ));
            }
        }

        // Level 5 (Highway) portal is open immediately; target is crossing
        if (lvl.id === 5 && !this.portalActive) {
            this.portalActive = true;
            if (this.exitPortal) this.exitPortal.activate();
        }
        
        // 3. Spawning dynamics
        if (lvl.id === 5) {
            // Speeding Volvos spawning dynamically in lanes
            if (Math.random() < 0.02) {
                this.spawnEnemy();
            }
        } else {
            // Keep spawning enemies up to a cap (e.g. 5 concurrent enemies)
            if (this.enemies.length < 5 && Math.random() < 0.008) {
                this.spawnEnemy();
            }
        }

        // Keep food items on screen
        if (this.items.length < 2 && Math.random() < 0.003) {
            this.spawnFoodItem(Math.random() > 0.4);
        }
        
        // 4. Update Enemies
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            enemy.update(dt, this.player, this.canvas, this.projectiles);
            
            // Handle player-enemy collision
            if (this.checkCollision(this.player, enemy)) {
                if (enemy.damageCooldown <= 0) {
                    let dmg = enemy.contactDamage;
                    
                    // If player has Knackebrod shield active
                    if (this.player.shieldActive) {
                        dmg = Math.floor(dmg * 0.2); // 80% shield block
                        // Shield impact particles
                        for (let p=0; p<8; p++) {
                            this.particles.push(new Particle(
                                this.player.x, this.player.y,
                                (Math.random()-0.5)*4, (Math.random()-0.5)*4,
                                "hsl(47, 100%, 50%)", 12
                            ));
                        }
                    }
                    
                    this.player.health -= dmg;
                    enemy.damageCooldown = 1000; // 1 second immunity before harming player again
                    triggerScreenShake(4);
                    sounds.playSFX('hit');
                    
                    // Blood splatter
                    for (let p=0; p<10; p++) {
                        this.particles.push(new Particle(
                            this.player.x, this.player.y,
                            (Math.random()-0.5)*6, (Math.random()-0.5)*6,
                            "red", 15
                        ));
                    }
                    
                    if (this.player.health <= 0) {
                        this.changeState(this.states.GAMEOVER);
                    }
                }
            }
            
            // Remove dead enemies
            if (enemy.health <= 0) {
                this.player.score += enemy.pointsValue;
                this.enemiesDefeatedThisLevel++;
                
                if (enemy.type === 'dalahorse') this.horsesDefeated++;
                
                // Explode particles
                for (let p = 0; p < 15; p++) {
                    this.particles.push(new Particle(
                        enemy.x, enemy.y, 
                        (Math.random() - 0.5) * 6, 
                        (Math.random() - 0.5) * 6, 
                        enemy.primaryColor, 
                        20
                    ));
                }
                
                // Chance to drop meatball
                if (Math.random() < 0.5) {
                    this.items.push(new MeatballItem(enemy.x, enemy.y));
                }
                
                this.enemies.splice(i, 1);
            }
        }
        
        // 5. Update Projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            proj.update(dt);
            
            // Check Collision for Player projectiles against Enemies
            if (proj.isPlayerOwned) {
                // If it's a surstromming can in flight, it explodes upon reaching target/timer
                if (proj.type === "surstromming") {
                    if (proj.lifetime <= 0) {
                        // Explode! Create Gas cloud (Special AOE Projectile)
                        this.projectiles.push(new GasCloud(proj.x, proj.y));
                        triggerScreenShake(5);
                        sounds.playSFX('explode');
                        
                        // Explosion gas cloud splash particles
                        for (let p = 0; p < 25; p++) {
                            this.particles.push(new Particle(
                                proj.x, proj.y,
                                (Math.random() - 0.5) * 7,
                                (Math.random() - 0.5) * 7,
                                "rgba(102, 187, 106, 0.8)",
                                40
                            ));
                        }
                        this.projectiles.splice(i, 1);
                        continue;
                    }
                }
                
                // Gas cloud ticks damage over time (checked within GasCloud class itself)
            } else {
                // Enemy projectile hitting Player
                if (this.checkCollision(this.player, proj)) {
                    let dmg = proj.damage;
                    if (this.player.shieldActive) {
                        dmg = Math.floor(dmg * 0.2);
                    }
                    this.player.health -= dmg;
                    triggerScreenShake(3);
                    sounds.playSFX('hit');
                    
                    // Splatter particles
                    for (let p=0; p<6; p++) {
                        this.particles.push(new Particle(
                            this.player.x, this.player.y,
                            (Math.random()-0.5)*4, (Math.random()-0.5)*4,
                            "red", 12
                        ));
                    }
                    
                    this.projectiles.splice(i, 1);
                    
                    if (this.player.health <= 0) {
                        this.changeState(this.states.GAMEOVER);
                    }
                    continue;
                }
            }
            
            // Clean up offscreen or dead projectiles
            if (proj.lifetime <= 0 || 
                proj.x < -20 || proj.x > this.canvas.width + 20 ||
                proj.y < -20 || proj.y > this.canvas.height + 20) {
                this.projectiles.splice(i, 1);
            }
        }
        
        // 6. Update Items (food pickup collisions)
        for (let i = this.items.length - 1; i >= 0; i--) {
            const item = this.items[i];
            item.update(dt);
            
            // Clean up offscreen items to prevent memory leaks and spawn blocking
            if (item.x < -100 || item.x > this.canvas.width + 100 ||
                item.y < -100 || item.y > this.canvas.height + 100) {
                this.items.splice(i, 1);
                continue;
            }
            
            if (this.checkCollision(this.player, item)) {
                if (item.type === "meatball") {
                    this.player.health = Math.min(100, this.player.health + 25);
                    this.player.score += 100;
                    this.meatballsCollected++;
                    sounds.playSFX('powerup');
                } else if (item.type === "knackebrod") {
                    this.player.activateSpeedBoost();
                    this.player.score += 150;
                    sounds.playSFX('powerup');
                }
                
                // Spawn green/gold pick up sparkles
                for (let p=0; p<10; p++) {
                    this.particles.push(new Particle(
                        item.x, item.y,
                        (Math.random()-0.5)*5, (Math.random()-0.5)*5,
                        item.type === "meatball" ? "#f56565" : "#ecc94b",
                        15
                    ));
                }
                
                this.items.splice(i, 1);
            }
        }
        
        // 7. Update Particles (Visual aesthetics)
        this.particles.update(dt);
        
        // 8. Level Transition Portals Check
        if (this.portalActive) {
            if (lvl.id === 10) {
                if (this.checkCollision(this.player, this.maypole)) {
                    this.changeState(this.states.VICTORY);
                }
            } else {
                if (this.checkCollision(this.player, this.exitPortal)) {
                    this.progressLevel();
                }
            }
        }
        
        // Reduce Screen Shake intensity
        if (shakeIntensity > 0) {
            shakeIntensity -= shakeDecay;
        } else {
            shakeIntensity = 0;
        }
        
        // Update bottom HUD bars
        this.updateHUD();
    }

    // AABB Collision Detection Helper
    checkCollision(rect1, rect2) {
        if (wasmExports && wasmExports.check_aabb_collision) {
            return wasmExports.check_aabb_collision(
                rect1.x, rect1.y, rect1.width, rect1.height,
                rect2.x, rect2.y, rect2.width, rect2.height
            ) !== 0;
        }
        return rect1.x - rect1.width/2 < rect2.x + rect2.width/2 &&
               rect1.x + rect1.width/2 > rect2.x - rect2.width/2 &&
               rect1.y - rect1.height/2 < rect2.y + rect2.height/2 &&
               rect1.y + rect1.height/2 > rect2.y - rect2.height/2;
    }

    progressLevel() {
        this.currentLevelIndex++;
        if (this.currentLevelIndex >= levels.length) {
            this.changeState(this.states.VICTORY);
        } else {
            // Lock exit gate list indices
            this.changeState(this.states.INTRO);
        }
    }

    updateHUD() {
        if (!this.player) return;
        
        // Energy Bar
        const energyPercent = Math.max(0, this.player.health);
        const energyBar = document.getElementById("hudEnergyBar");
        energyBar.style.width = `${energyPercent}%`;
        document.getElementById("hudEnergyText").innerText = `${Math.floor(this.player.health)} / 100`;
        
        // Score
        document.getElementById("hudScore").innerText = String(this.player.score).padStart(6, '0');
        
        // Ammo
        const ammoGrid = document.getElementById("hudAmmoGrid");
        ammoGrid.innerHTML = "";
        for (let i = 0; i < 3; i++) {
            const can = document.createElement("span");
            can.className = `ammo-can ${i < this.player.ammo ? 'active' : ''}`;
            can.innerText = "🐟";
            ammoGrid.appendChild(can);
        }
        
        // Active Objective Update
        const lvl = levels[this.currentLevelIndex];
        const objElem = document.getElementById("hudObjective");
        if (objElem) {
            if (lvl.id === 5) {
                objElem.innerText = "CROSS HIGHWAY!";
                objElem.style.color = "var(--swedish-yellow)";
            } else if (this.portalActive) {
                objElem.innerText = lvl.id === 10 ? "TOUCH THE MAYPOLE!" : "GO TO PORTAL! 🇸🇪";
                objElem.style.color = "var(--accent-green)";
            } else {
                const targetName = lvl.enemyType === "shopper" ? "SHOPPERS" :
                                   lvl.enemyType === "drunkard" ? "DRUNKARDS" :
                                   lvl.enemyType === "kid" ? "SUGAR-RUSH KIDS" :
                                   lvl.enemyType === "zappafan" ? "ZAPPA FANS" :
                                   lvl.enemyType === "dalahorse" ? "DALARNA HORSES" :
                                   lvl.enemyType === "elk" ? "AGGRESSIVE ELK" :
                                   lvl.enemyType === "guard" ? "PRISON GUARDS" :
                                   lvl.enemyType === "raver" ? "NEON RAVERS" : "ABBA BOTS";
                objElem.innerText = `DEFEAT ${targetName}: ${this.enemiesDefeatedThisLevel} / ${lvl.enemiesToDefeat}`;
                objElem.style.color = "var(--swedish-yellow)";
            }
        }
    }

    updateSidebarIndicators() {
        const listItems = document.querySelectorAll("#levelTrackerList li");
        listItems.forEach((li, idx) => {
            li.classList.remove("active", "completed");
            
            const liLvl = parseInt(li.dataset.level);
            const currentLvl = this.currentLevelIndex + 1;
            
            if (liLvl === currentLvl) {
                li.classList.add("active");
            } else if (liLvl < currentLvl) {
                li.classList.add("completed");
            }
        });
    }

    // --- SYSTEM RENDER DRAWING ---
    
    render() {
        this.ctx.save();
        
        // Apply Screen Shake transform if triggered
        if (shakeIntensity > 0) {
            const dx = (Math.random() - 0.5) * shakeIntensity;
            const dy = (Math.random() - 0.5) * shakeIntensity;
            this.ctx.translate(dx, dy);
        }
        
        const lvl = levels[this.currentLevelIndex];
        
        // Clear canvas with level-specific background color
        this.ctx.fillStyle = lvl.colors.bg;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw Tiled Floor Grid (Retro texture feel)
        this.ctx.strokeStyle = lvl.colors.grid;
        this.ctx.lineWidth = 0.5;
        this.ctx.globalAlpha = 0.15;
        
        const tileSize = 50;
        for (let x = 0; x < this.canvas.width; x += tileSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        for (let y = 0; y < this.canvas.height; y += tileSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
        this.ctx.globalAlpha = 1.0;
        
        // Draw Exit portals / Maypoles
        if (this.exitPortal) this.exitPortal.draw(this.ctx);
        if (this.maypole) this.maypole.draw(this.ctx);
        
        // Draw Items (Meatballs/Knackebrod)
        this.items.forEach(item => item.draw(this.ctx));
        
        // Draw Enemies
        this.enemies.forEach(enemy => enemy.draw(this.ctx));
        
        // Draw Player
        if (this.player && this.currentState === this.states.PLAYING) {
            this.player.draw(this.ctx);
        }
        
        // Draw Projectiles
        this.projectiles.forEach(proj => proj.draw(this.ctx));
        
        // Draw Particles
        this.particles.draw(this.ctx);
        
        // Level Exit Status Text Overlay on Canvas
        if (this.portalActive && this.currentState === this.states.PLAYING) {
            this.ctx.fillStyle = "rgba(0,0,0,0.5)";
            this.ctx.fillRect(this.canvas.width / 2 - 200, 20, 400, 35);
            this.ctx.strokeStyle = "hsl(47, 100%, 50%)";
            this.ctx.lineWidth = 1.5;
            this.ctx.strokeRect(this.canvas.width / 2 - 200, 20, 400, 35);
            
            this.ctx.font = "10px 'Press Start 2P'";
            this.ctx.fillStyle = "hsl(47, 100%, 50%)";
            this.ctx.textAlign = "center";
            
            if (lvl.id === 10) {
                this.ctx.fillText("MAYPOLE REACHED! GET TO CENTER!", this.canvas.width / 2, 42);
            } else {
                this.ctx.fillText("SWEDISH PORTAL OPEN! GO RIGHT! 🇸🇪", this.canvas.width / 2, 42);
            }
        }
        
        this.ctx.restore();
    }
}


// --- ENTITY CLASSES ---

// 1. SVEN (Player class)
class Sven {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 32;
        this.height = 42;
        this.speed = 3.5;
        this.baseSpeed = 3.5;
        this.health = 100;
        this.score = 0;
        
        // Ranged Attack parameters
        this.ammo = 3;
        this.ammoRegenTimer = 0;
        
        // Speed Boost Power-Up State
        this.speedBoostActive = false;
        this.speedBoostTimer = 0;
        this.shieldActive = false;
        
        // Visual angle (faces towards mouse)
        this.angle = 0;
        
        // Hockey Stick Swing Melee parameters
        this.isSwinging = false;
        this.swingTimer = 0;
        this.swingDuration = 180; // ms
        this.swingArcStart = -Math.PI / 3;
        this.swingArcEnd = Math.PI / 3;
    }

    update(dt, inputs, mousePos, canvas) {
        // Calculate aiming angle
        const dx = mousePos.x - this.x;
        const dy = mousePos.y - this.y;
        this.angle = Math.atan2(dy, dx);
        
        // Handle temporary power-up timer
        if (this.speedBoostActive) {
            this.speedBoostTimer -= dt;
            if (this.speedBoostTimer <= 0) {
                this.speedBoostActive = false;
                this.shieldActive = false;
                this.speed = this.baseSpeed;
            }
        }
        
        // Vector Movement
        let moveX = 0;
        let moveY = 0;
        
        if (inputs.moveUp) moveY -= 1;
        if (inputs.moveDown) moveY += 1;
        if (inputs.moveLeft) moveX -= 1;
        if (inputs.moveRight) moveX += 1;
        
        // Normalized diagonal speed
        if (moveX !== 0 && moveY !== 0) {
            const length = Math.sqrt(moveX * moveX + moveY * moveY);
            moveX /= length;
            moveY /= length;
        }
        
        this.x += moveX * this.speed;
        this.y += moveY * this.speed;
        
        // Bound checks inside canvas boundaries
        this.x = Math.max(this.width / 2, Math.min(canvas.width - this.width / 2, this.x));
        this.y = Math.max(this.height / 2, Math.min(canvas.height - this.height / 2, this.y));
        
        // Melee Swing timer progression
        if (this.isSwinging) {
            this.swingTimer += dt;
            if (this.swingTimer >= this.swingDuration) {
                this.isSwinging = false;
                this.swingTimer = 0;
            }
        }
    }

    activateSpeedBoost() {
        this.speedBoostActive = true;
        this.shieldActive = true;
        this.speed = this.baseSpeed * 1.5;
        this.speedBoostTimer = 4000; // 4 seconds duration
    }

    meleeSwing(enemies, mousePos) {
        if (this.isSwinging) return; // Wait for current swing
        
        this.isSwinging = true;
        this.swingTimer = 0;
        sounds.playSFX('swing');
        triggerScreenShake(2);
        
        // Swing geometry check
        const range = 65;
        const meleeDmg = 35;
        
        enemies.forEach(enemy => {
            const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
            if (dist <= range) {
                // Check if enemy lies inside the swinging angle arc
                const angleToEnemy = Math.atan2(enemy.y - this.y, enemy.x - this.x);
                let diff = angleToEnemy - this.angle;
                
                // Wrap difference between -PI and PI
                diff = Math.atan2(Math.sin(diff), Math.cos(diff));
                
                if (Math.abs(diff) < Math.PI / 2) {
                    enemy.health -= meleeDmg;
                    enemy.x += Math.cos(angleToEnemy) * 20; // knockback
                    enemy.y += Math.sin(angleToEnemy) * 20;
                    
                    // Blood splatter
                    for (let p=0; p<8; p++) {
                        game.particles.push(new Particle(
                            enemy.x, enemy.y,
                            (Math.random()-0.5)*5, (Math.random()-0.5)*5,
                            "hsl(47, 100%, 50%)", 15
                        ));
                    }
                    sounds.playSFX('hit');
                }
            }
        });
    }

    throwSurstromming(mousePos, projectiles) {
        const dx = mousePos.x - this.x;
        const dy = mousePos.y - this.y;
        const length = Math.hypot(dx, dy) || 1;
        
        const vx = (dx / length) * 6;
        const vy = (dy / length) * 6;
        
        // Throw range capped by mouse distance
        const targetDist = Math.min(250, length);
        const flightTime = targetDist / 6; // frames
        
        projectiles.push(new SurstrommingCan(this.x, this.y, vx, vy, flightTime * 16.67));
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Knackebrod shield bubble
        if (this.shieldActive) {
            ctx.strokeStyle = "rgba(255, 215, 0, 0.6)";
            ctx.lineWidth = 3;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(0, 0, 30 + Math.sin(Date.now() / 100) * 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        // Rotate player body towards aiming direction
        ctx.rotate(this.angle);
        
        // Sven Character Body (Swedish Flag Shirt)
        ctx.fillStyle = "hsl(205, 100%, 45%)";
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        
        // Yellow Cross Design
        ctx.fillStyle = "hsl(47, 100%, 50%)";
        ctx.fillRect(-this.width / 2, -4, this.width, 8);
        ctx.fillRect(-4, -this.height / 2, 8, this.height);
        
        // Face/Head
        ctx.fillStyle = "#ffdbac"; // Skin tone
        ctx.beginPath();
        ctx.arc(4, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        
        // Flower crown on head (Midsummer tradition!)
        ctx.strokeStyle = "#48bb78"; // Green leaves ring
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(4, 0, 11, 0, Math.PI * 2);
        ctx.stroke();
        
        // Flower dots (yellow, white, blue)
        ctx.fillStyle = "#fff";
        ctx.fillRect(10, -5, 3, 3);
        ctx.fillStyle = "hsl(47, 100%, 50%)";
        ctx.fillRect(8, 6, 3, 3);
        ctx.fillStyle = "hsl(205, 100%, 45%)";
        ctx.fillRect(-1, -10, 3, 3);
        
        // Draw melee weapon swing
        if (this.isSwinging) {
            // Swing arc angle calculation
            const progress = this.swingTimer / this.swingDuration;
            const currentSwingAngle = this.swingArcStart + (this.swingArcEnd - this.swingArcStart) * progress;
            
            ctx.save();
            ctx.rotate(currentSwingAngle);
            
            // Wooden Hockey Stick
            ctx.fillStyle = "#8b5a2b";
            ctx.fillRect(10, -4, 35, 6); // handle
            ctx.fillStyle = "#cd853f";
            ctx.fillRect(45, -4, 8, 16); // blade
            
            // Swing blur wave effect
            ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
            ctx.beginPath();
            ctx.arc(0, 0, 50, -0.4, 0.4);
            ctx.lineTo(0,0);
            ctx.fill();
            
            ctx.restore();
        } else {
            // Idle Hockey Stick representation
            ctx.fillStyle = "#8b5a2b";
            ctx.fillRect(10, 8, 20, 4);
            ctx.fillStyle = "#cd853f";
            ctx.fillRect(30, 8, 5, 10);
        }
        
        ctx.restore();
    }
}

// 2. PROJECTILE BASE CLASSES

class SurstrommingCan {
    constructor(x, y, vx, vy, flightTime) {
        this.x = x;
        this.y = y;
        this.width = 16;
        this.height = 16;
        this.vx = vx;
        this.vy = vy;
        this.isPlayerOwned = true;
        this.type = "surstromming";
        
        this.lifetime = flightTime; // explodes when timer reaches zero
        this.rotation = 0;
    }

    update(dt) {
        this.x += this.vx;
        this.y += this.vy;
        this.lifetime -= dt;
        this.rotation += 0.2;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        // Steel fish can graphics
        ctx.fillStyle = "#a0aec0";
        ctx.fillRect(-this.width/2, -this.height/2, this.width, this.height);
        
        // Yellow label strip
        ctx.fillStyle = "hsl(47, 100%, 50%)";
        ctx.fillRect(-this.width/2, -3, this.width, 6);
        
        // Smell indicator green ripples
        ctx.strokeStyle = "rgba(72, 187, 120, 0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 14 + Math.sin(Date.now() / 50) * 3, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
    }
}

// Explosive lingering biological hazard gas cloud
class GasCloud {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 120;
        this.height = 120;
        this.isPlayerOwned = true;
        this.type = "gascloud";
        this.lifetime = 3500; // lingers 3.5 seconds
        
        this.damageTickTimer = 0;
    }

    update(dt) {
        this.lifetime -= dt;
        this.damageTickTimer += dt;
        
        // Tick damage on enemies inside every 200ms
        if (this.damageTickTimer >= 200) {
            this.damageTickTimer = 0;
            
            game.enemies.forEach(enemy => {
                const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
                if (dist < this.width / 2) {
                    enemy.health -= 6; // low constant ticks
                    // Small floating green bubbles
                    if (Math.random() < 0.3) {
                        game.particles.push(new Particle(
                            enemy.x, enemy.y,
                            (Math.random()-0.5)*2, -Math.random()*3,
                            "rgba(144, 205, 151, 0.8)", 10
                        ));
                    }
                }
            });
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Giant glowing green toxic mist
        const radialGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, this.width / 2);
        radialGrad.addColorStop(0, "rgba(72, 187, 120, 0.45)");
        radialGrad.addColorStop(0.7, "rgba(72, 187, 120, 0.18)");
        radialGrad.addColorStop(1, "rgba(72, 187, 120, 0)");
        
        ctx.fillStyle = radialGrad;
        ctx.beginPath();
        ctx.arc(0, 0, this.width / 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Render tiny green biological warning icons
        ctx.fillStyle = "rgba(39, 103, 73, 0.4)";
        ctx.font = "8px Arial";
        ctx.fillText("☣", -15, 5);
        ctx.fillText("☣", 10, -10);
        
        ctx.restore();
    }
}

// Enemy projectiles
class FlatpackBox {
    constructor(x, y, vx, vy) {
        this.x = x;
        this.y = y;
        this.width = 14;
        this.height = 14;
        this.vx = vx;
        this.vy = vy;
        this.isPlayerOwned = false;
        this.damage = 10;
        this.lifetime = 4000;
    }
    update(dt) {
        this.x += this.vx;
        this.y += this.vy;
        this.lifetime -= dt;
    }
    draw(ctx) {
        ctx.fillStyle = "#d2b48c"; // cardboard brown
        ctx.fillRect(this.x - this.width/2, this.y - this.height/2, this.width, this.height);
        ctx.strokeStyle = "#8b5a2b";
        ctx.lineWidth = 1;
        ctx.strokeRect(this.x - this.width/2, this.y - this.height/2, this.width, this.height);
        // Draw cross straps
        ctx.beginPath();
        ctx.moveTo(this.x - this.width/2, this.y);
        ctx.lineTo(this.x + this.width/2, this.y);
        ctx.moveTo(this.x, this.y - this.height/2);
        ctx.lineTo(this.x, this.y + this.height/2);
        ctx.stroke();
    }
}

class Bottle {
    constructor(x, y, vx, vy) {
        this.x = x;
        this.y = y;
        this.width = 8;
        this.height = 18;
        this.vx = vx;
        this.vy = vy;
        this.isPlayerOwned = false;
        this.damage = 12;
        this.lifetime = 4000;
        this.rotation = 0;
    }
    update(dt) {
        this.x += this.vx;
        this.y += this.vy;
        this.rotation += 0.15;
        this.lifetime -= dt;
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        ctx.fillStyle = "#2f855a"; // green bottle glass
        ctx.fillRect(-this.width/2, -this.height/2, this.width, this.height);
        ctx.fillStyle = "#cbd5e0"; // cap
        ctx.fillRect(-2, -this.height/2 - 2, 4, 2);
        
        ctx.restore();
    }
}

class MusicNote {
    constructor(x, y, vx, vy, character) {
        this.x = x;
        this.y = y;
        this.width = 12;
        this.height = 12;
        this.vx = vx;
        this.vy = vy;
        
        if (!character) {
            if (!MusicNote.letters) {
                MusicNote.letters = ["B", "O", "B", "B", "Y", "B", "R", "O", "W", "N"];
                MusicNote.currentIndex = 0;
            }
            character = MusicNote.letters[MusicNote.currentIndex];
            MusicNote.currentIndex = (MusicNote.currentIndex + 1) % MusicNote.letters.length;
        }
        this.character = character; // 'B', 'O', 'B', 'Y' etc
        this.isPlayerOwned = false;
        this.damage = 8;
        this.lifetime = 3500;
    }
    update(dt) {
        this.x += this.vx;
        this.y += this.vy;
        this.lifetime -= dt;
    }
    draw(ctx) {
        ctx.fillStyle = "#a78bfa"; // glowing purple note
        ctx.font = "bold 14px 'Press Start 2P'";
        ctx.fillText(this.character, this.x - 6, this.y + 6);
    }
}

class LaserBall {
    constructor(x, y, vx, vy) {
        this.x = x;
        this.y = y;
        this.width = 12;
        this.height = 12;
        this.vx = vx;
        this.vy = vy;
        this.isPlayerOwned = false;
        this.damage = 15;
        this.lifetime = 3000;
    }
    update(dt) {
        this.x += this.vx;
        this.y += this.vy;
        this.lifetime -= dt;
    }
    draw(ctx) {
        // Glowing cyan/pink ball
        const grad = ctx.createRadialGradient(this.x, this.y, 1, this.x, this.y, 6);
        grad.addColorStop(0, "#fff");
        grad.addColorStop(0.5, "#ec4899");
        grad.addColorStop(1, "rgba(236,72,153,0)");
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 6, 0, Math.PI * 2);
        ctx.fill();
    }
}


// 3. ENEMY TYPE IMPLEMENTATIONS

class Enemy {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.width = 30;
        this.height = 40;
        this.speed = 1.5;
        this.health = 50;
        this.pointsValue = 200;
        
        this.damageCooldown = 0;
        this.contactDamage = 15;
        this.primaryColor = "white";
    }

    update(dt, player, canvas, projectiles) {
        if (this.damageCooldown > 0) this.damageCooldown -= dt;
        
        // Default AI: walk towards Sven
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist > 5) {
            this.x += (dx / dist) * this.speed;
            this.y += (dy / dist) * this.speed;
        }
    }

    draw(ctx) {
        // override
    }
}

// Lvl 1: Ikea shopper carrying boxes
class Shopper extends Enemy {
    constructor(x, y) {
        super(x, y, "shopper");
        this.health = 45;
        this.speed = 1.3;
        this.primaryColor = "#ecc94b"; // yellow
        this.shootCooldown = Math.random() * 2000 + 1000;
    }

    update(dt, player, canvas, projectiles) {
        super.update(dt, player, canvas, projectiles);
        
        // Throw flatpack boxes at Sven
        this.shootCooldown -= dt;
        if (this.shootCooldown <= 0) {
            this.shootCooldown = Math.random() * 2500 + 2000; // every 2-4.5s
            
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.hypot(dx, dy) || 1;
            
            const vx = (dx / dist) * 3;
            const vy = (dy / dist) * 3;
            
            projectiles.push(new FlatpackBox(this.x, this.y, vx, vy));
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Shopper (yellow/blue clothing, carrying blue FRAKTA bag)
        ctx.fillStyle = "#ecc94b"; // Ikea yellow shirt
        ctx.fillRect(-15, -20, 30, 40);
        
        // Blue pants
        ctx.fillStyle = "#3182ce";
        ctx.fillRect(-15, 10, 30, 10);
        
        // Head
        ctx.fillStyle = "#ffd8b1";
        ctx.beginPath();
        ctx.arc(0, -22, 9, 0, Math.PI*2);
        ctx.fill();
        
        // FRAKTA shopping bag
        ctx.fillStyle = "#1e3a8a"; // deep blue
        ctx.fillRect(8, -8, 12, 16);
        ctx.strokeStyle = "#ecc94b"; // yellow straps
        ctx.lineWidth = 1.5;
        ctx.strokeRect(8, -8, 12, 16);
        
        ctx.restore();
    }
}

// Lvl 2: Drunk Swedish guy throwing bottles
class Drunkard extends Enemy {
    constructor(x, y) {
        super(x, y, "drunkard");
        this.health = 60; // slightly tankier
        this.speed = 1.0;
        this.primaryColor = "#48bb78"; // green
        this.throwCooldown = Math.random() * 1500 + 1000;
        
        // Drunk wobbling vectors
        this.wobbleTimer = 0;
    }

    update(dt, player, canvas, projectiles) {
        if (this.damageCooldown > 0) this.damageCooldown -= dt;
        
        // Drunk movement - stumbling sway
        this.wobbleTimer += 0.05;
        const wobbleX = Math.sin(this.wobbleTimer) * 1.5;
        const wobbleY = Math.cos(this.wobbleTimer * 0.7) * 0.8;
        
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.hypot(dx, dy);
        
        // Walk stumbling towards Sven
        if (dist > 5) {
            this.x += ((dx / dist) * this.speed) + wobbleX;
            this.y += ((dy / dist) * this.speed) + wobbleY;
        } else {
            this.x += wobbleX;
            this.y += wobbleY;
        }
        
        // Keep in canvas bounds
        this.x = Math.max(15, Math.min(canvas.width - 15, this.x));
        this.y = Math.max(20, Math.min(canvas.height - 20, this.y));
        
        // Lob bottles
        this.throwCooldown -= dt;
        if (this.throwCooldown <= 0) {
            this.throwCooldown = Math.random() * 2000 + 1500;
            
            const safeDist = dist || 1;
            const vx = (dx / safeDist) * 4;
            const vy = (dy / safeDist) * 4;
            
            projectiles.push(new Bottle(this.x, this.y, vx, vy));
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Wobble draw rotation
        ctx.rotate(Math.sin(this.wobbleTimer) * 0.1);
        
        // Red checkered shirt
        ctx.fillStyle = "#e53e3e";
        ctx.fillRect(-15, -20, 30, 40);
        ctx.strokeStyle = "#4a5568";
        ctx.lineWidth = 1;
        ctx.strokeRect(-15, -20, 30, 40);
        
        // Blue jeans
        ctx.fillStyle = "#2b6cb0";
        ctx.fillRect(-15, 10, 30, 10);
        
        // Red nose on face
        ctx.fillStyle = "#ffddbb";
        ctx.beginPath();
        ctx.arc(0, -22, 9, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = "red";
        ctx.beginPath();
        ctx.arc(0, -20, 3, 0, Math.PI*2);
        ctx.fill();
        
        ctx.restore();
    }
}

// CandyKid enemy class (Level 3: Lördagsgodis)
class CandyKid extends Enemy {
    constructor(x, y) {
        super(x, y, "kid");
        this.health = 35;
        this.speed = 1.8; // super fast
        this.primaryColor = "#ff69b4"; // hot pink
        this.throwCooldown = Math.random() * 800 + 500;
        this.wobbleTimer = 0;
    }

    update(dt, player, canvas, projectiles) {
        super.update(dt, player, canvas, projectiles);
        this.wobbleTimer += 0.4;
        
        // Clamp to screen bounds
        this.x = Math.max(15, Math.min(canvas.width - 15, this.x));
        this.y = Math.max(20, Math.min(canvas.height - 20, this.y));

        this.throwCooldown -= dt;
        if (this.throwCooldown <= 0) {
            this.throwCooldown = Math.random() * 1200 + 800; // rapid firing
            
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.hypot(dx, dy) || 1;
            
            // Throw candy projectile towards player
            const vx = (dx / dist) * 4.8;
            const vy = (dy / dist) * 4.8;
            projectiles.push(new Lordagsgodis(this.x, this.y, vx, vy));
        }
    }

    draw(ctx) {
        ctx.save();
        // High frequency vibration/shiver representing sugar-rush
        const vibX = Math.sin(this.wobbleTimer) * 2.5;
        const vibY = Math.cos(this.wobbleTimer * 1.2) * 2.5;
        ctx.translate(this.x + vibX, this.y + vibY);

        // Face player direction
        if (game.player.x < this.x) {
            ctx.scale(-1, 1);
        }

        // Draw kid (smaller than adult shoppers)
        // Body (bright neon t-shirt)
        ctx.fillStyle = "#39ff14"; // neon green
        ctx.fillRect(-10, -12, 20, 24);
        
        // Pants (jeans)
        ctx.fillStyle = "#1e40af";
        ctx.fillRect(-10, 12, 20, 6);

        // Head
        ctx.fillStyle = "#ffd8b1";
        ctx.beginPath();
        ctx.arc(0, -18, 7, 0, Math.PI * 2);
        ctx.fill();

        // Messy hyper hair (bright orange/yellow)
        ctx.fillStyle = "#f97316";
        ctx.fillRect(-9, -27, 18, 5);
        ctx.fillRect(-9, -23, 3, 5);
        ctx.fillRect(6, -23, 3, 5);

        // Large candy bag (spilling sweets)
        ctx.fillStyle = "#ec4899"; // pink candy bag
        ctx.fillRect(5, -4, 9, 12);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.strokeRect(5, -4, 9, 12);
        
        // Spilled candy dots on the bag
        ctx.fillStyle = "#eab308";
        ctx.fillRect(7, 0, 2, 2);
        ctx.fillStyle = "#a855f7";
        ctx.fillRect(10, 4, 2, 2);

        ctx.restore();
    }
}

// Lördagsgodis sweet candy projectile
class Lordagsgodis {
    constructor(x, y, vx, vy) {
        this.x = x;
        this.y = y;
        this.width = 10;
        this.height = 10;
        this.vx = vx;
        this.vy = vy;
        this.isPlayerOwned = false;
        this.damage = 5; // rapid but low damage
        this.lifetime = 3500;
        this.rotation = 0;
        this.rotSpeed = (Math.random() - 0.5) * 0.4;
        
        // Sugary colors: Red jelly, Yellow lemon, Purple grape, Licorice brown
        const candyColors = ["#ef4444", "#eab308", "#a855f7", "#451a03", "#3b82f6"];
        this.color = candyColors[Math.floor(Math.random() * candyColors.length)];
        
        // Shape style: 0 = circle, 1 = square, 2 = star/cross
        this.shapeStyle = Math.floor(Math.random() * 3);
    }

    update(dt) {
        this.x += this.vx;
        this.y += this.vy;
        this.rotation += this.rotSpeed;
        this.lifetime -= dt;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.fillStyle = this.color;
        
        // Candy highlights/glaze
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 4;

        if (this.shapeStyle === 0) {
            // Round jelly drop
            ctx.beginPath();
            ctx.arc(0, 0, 5, 0, Math.PI * 2);
            ctx.fill();
            // Sugar crystal speck
            ctx.fillStyle = "#fff";
            ctx.fillRect(-2, -2, 1.5, 1.5);
        } else if (this.shapeStyle === 1) {
            // Sweet gel candy block
            ctx.fillRect(-5, -5, 10, 10);
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1;
            ctx.strokeRect(-5, -5, 10, 10);
        } else {
            // Candy star/cross
            ctx.beginPath();
            ctx.moveTo(-5, 0);
            ctx.lineTo(5, 0);
            ctx.moveTo(0, -5);
            ctx.lineTo(0, 5);
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 3.5;
            ctx.stroke();
            // center dot
            ctx.fillStyle = "#fff";
            ctx.fillRect(-1.5, -1.5, 3, 3);
        }

        ctx.restore();
    }
}

// Lvl 4: Zappa fan shouting Bobby Brown
class ZappaFan extends Enemy {
    constructor(x, y) {
        super(x, y, "zappafan");
        this.health = 55;
        this.speed = 1.2;
        this.primaryColor = "#b7791f"; // brown/mustard
        
        this.singLetters = ["B", "O", "B", "B", "Y"];
        this.singIndex = 0;
        this.singCooldown = Math.random() * 1200 + 800;
    }

    update(dt, player, canvas, projectiles) {
        super.update(dt, player, canvas, projectiles);
        
        // Sing notes at Sven
        this.singCooldown -= dt;
        if (this.singCooldown <= 0) {
            this.singCooldown = 1500;
            
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.hypot(dx, dy) || 1;
            
            const vx = (dx / dist) * 3.5;
            const vy = (dy / dist) * 3.5;
            
            const char = this.singLetters[this.singIndex];
            this.singIndex = (this.singIndex + 1) % this.singLetters.length;
            
            projectiles.push(new MusicNote(this.x, this.y, vx, vy, char));
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Zappa fan (purple flares, huge mustache, long black hair)
        ctx.fillStyle = "#a78bfa"; // purple bell-bottom shirt
        ctx.fillRect(-14, -18, 28, 38);
        
        // Brown flares
        ctx.fillStyle = "#744210";
        ctx.fillRect(-14, 10, 28, 12);
        
        // Black hair framing face
        ctx.fillStyle = "#000";
        ctx.fillRect(-12, -26, 24, 20);
        
        // Face
        ctx.fillStyle = "#ffd8b1";
        ctx.beginPath();
        ctx.arc(0, -20, 8, 0, Math.PI*2);
        ctx.fill();
        
        // Iconic Zappa Mustache and goatee
        ctx.fillStyle = "#000";
        ctx.fillRect(-7, -18, 14, 3); // mustache
        ctx.fillRect(-2, -15, 4, 6);  // goatee
        
        ctx.restore();
    }
}

// Lvl 4: Volvo Cars (zoom fast horizontally/vertically)
class VolvoCar extends Enemy {
    constructor(x, y, dir) {
        super(x, y, "volvo");
        this.width = 60;
        this.height = 32;
        this.speed = 6.0; // very fast zoom
        this.dir = dir; // 1 = right, -1 = left
        this.health = 200; // indestructible practically
        this.contactDamage = 40; // huge crash damage
        this.pointsValue = 50;
        this.primaryColor = "#3182ce"; // classic Volvo blue
    }

    update(dt, player, canvas, projectiles) {
        // Move strictly straight
        this.x += this.speed * this.dir;
        
        // Destroy when fully off screen
        if ((this.dir === 1 && this.x > canvas.width + 100) || 
            (this.dir === -1 && this.x < -100)) {
            this.health = -1; // removes cleanly
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Flip wagon based on heading
        if (this.dir === -1) {
            ctx.scale(-1, 1);
        }
        
        // Boxy Volvo Station Wagon body
        ctx.fillStyle = "hsl(205, 100%, 45%)";
        ctx.fillRect(-30, -12, 60, 24);
        
        // Cabin top
        ctx.fillRect(-25, -22, 40, 12);
        
        // Windshield and windows
        ctx.fillStyle = "#e2e8f0";
        ctx.fillRect(8, -20, 6, 8); // front windshield
        ctx.fillRect(-5, -20, 10, 8); // side window
        ctx.fillRect(-22, -20, 14, 8); // trunk window
        
        // Yellow headlights
        ctx.fillStyle = "#ecc94b";
        ctx.fillRect(28, -6, 3, 6);
        // Headlight beam (glow)
        const beam = ctx.createLinearGradient(30, -3, 60, -3);
        beam.addColorStop(0, "rgba(255, 235, 100, 0.4)");
        beam.addColorStop(1, "rgba(255, 235, 100, 0)");
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(30, -6);
        ctx.lineTo(80, -25);
        ctx.lineTo(80, 15);
        ctx.lineTo(30, 6);
        ctx.fill();
        
        // Wheels
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.arc(-16, 12, 8, 0, Math.PI*2);
        ctx.arc(16, 12, 8, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = "#cbd5e0"; // hubcaps
        ctx.beginPath();
        ctx.arc(-16, 12, 4, 0, Math.PI*2);
        ctx.arc(16, 12, 4, 0, Math.PI*2);
        ctx.fill();
        
        // Swedish badge license plate 'SE'
        ctx.fillStyle = "#fff";
        ctx.fillRect(-28, 4, 8, 5);
        ctx.font = "bold 4px Arial";
        ctx.fillStyle = "#000";
        ctx.fillText("SE", -26, 8);
        
        ctx.restore();
    }
}

// Lvl 5: Killer Dalarna wooden horse
class DalarnaHorse extends Enemy {
    constructor(x, y) {
        super(x, y, "dalahorse");
        this.width = 36;
        this.height = 36;
        this.health = 75;
        this.speed = 0.8; // slow walk
        this.primaryColor = "#e53e3e"; // red horse
        
        // Burst dash parameters
        this.dashTimer = Math.random() * 2000 + 1000;
        this.isDashing = false;
        this.dashDuration = 0;
        this.dashVx = 0;
        this.dashVy = 0;
    }

    update(dt, player, canvas, projectiles) {
        if (this.damageCooldown > 0) this.damageCooldown -= dt;
        
        if (this.isDashing) {
            // Dash logic
            this.x += this.dashVx * 5.5;
            this.y += this.dashVy * 5.5;
            this.dashDuration -= dt;
            
            // Spawn little red run trails
            if (Math.random() < 0.3) {
                game.particles.push(new Particle(this.x, this.y, 0, 0, "rgba(229,62,62,0.4)", 8));
            }
            
            if (this.dashDuration <= 0) {
                this.isDashing = false;
                this.dashTimer = Math.random() * 2000 + 1500; // wait before next dash
            }
        } else {
            // Normal pacing towards Sven
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.hypot(dx, dy);
            
            if (dist > 5) {
                this.x += (dx / dist) * this.speed;
                this.y += (dy / dist) * this.speed;
            }
            
            this.dashTimer -= dt;
            if (this.dashTimer <= 0 && dist < 300) {
                // Trigger dash
                this.isDashing = true;
                this.dashDuration = 600; // 600ms dash
                const safeDist = dist || 1;
                this.dashVx = dx / safeDist;
                this.dashVy = dy / safeDist;
            }
        }
        
        // Keep in bounds
        this.x = Math.max(15, Math.min(canvas.width - 15, this.x));
        this.y = Math.max(20, Math.min(canvas.height - 20, this.y));
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Face moving direction
        if (this.dashVx < 0 || (!this.isDashing && game.player.x < this.x)) {
            ctx.scale(-1, 1);
        }
        
        // Traditional Red Dalarna Horse shape drawn via canvas path
        ctx.fillStyle = "#e53e3e"; // Red body
        
        ctx.beginPath();
        // Body rectangle-ish
        ctx.moveTo(-18, -4);
        ctx.lineTo(10, -4);
        // Neck/Head
        ctx.lineTo(18, -20);
        ctx.lineTo(12, -24);
        ctx.lineTo(8, -12);
        // Chest/Front Leg
        ctx.lineTo(-2, 16);
        ctx.lineTo(-8, 16);
        ctx.lineTo(-8, 2);
        // Back leg
        ctx.lineTo(-18, 16);
        ctx.lineTo(-24, 16);
        ctx.lineTo(-24, -4);
        ctx.closePath();
        ctx.fill();
        
        // Traditional Folk art details (kurbits pattern)
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        // Saddle harness curves
        ctx.beginPath();
        ctx.arc(-2, -2, 10, Math.PI, Math.PI * 1.6);
        ctx.stroke();
        
        // Yellow kurbits leaf strokes
        ctx.fillStyle = "hsl(47, 100%, 50%)";
        ctx.beginPath();
        ctx.arc(4, -5, 3, 0, Math.PI*2);
        ctx.arc(-8, -2, 3, 0, Math.PI*2);
        ctx.fill();
        
        // White markings on mane
        ctx.fillStyle = "#fff";
        ctx.fillRect(14, -20, 2, 4);
        ctx.fillRect(11, -16, 2, 4);
        
        ctx.restore();
    }
}

// Elk enemy class (Level 6: Allemansrätten)
class Elk extends Enemy {
    constructor(x, y) {
        super(x, y, "elk");
        this.width = 44;
        this.height = 40;
        this.health = 110;
        this.speed = 1.0;
        this.primaryColor = "#5a4a42"; // brownish-grey
        
        // Behavior states
        this.state = "walk"; // "walk", "prep", "charge", "stomp"
        this.stateTimer = Math.random() * 2000 + 1500; // time until next charge prep
        this.chargeVx = 0;
        this.chargeVy = 0;
        this.walkTimer = 0;
        this.prepFlash = 0;
        this.stompRadius = 0;
    }

    update(dt, player, canvas, projectiles) {
        if (this.damageCooldown > 0) this.damageCooldown -= dt;
        this.walkTimer += 0.05;

        if (this.state === "walk") {
            // Move towards player
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 5) {
                this.x += (dx / dist) * this.speed;
                this.y += (dy / dist) * this.speed;
            }
            
            this.stateTimer -= dt;
            if (this.stateTimer <= 0 && dist < 350) {
                this.state = "prep";
                this.stateTimer = 800; // 800ms warning / puffing steam
                this.prepFlash = 0;
            }
        } else if (this.state === "prep") {
            this.stateTimer -= dt;
            this.prepFlash += dt;
            // Spawn steam puff particles from nose area
            if (Math.random() < 0.25) {
                const faceDir = (player.x > this.x) ? 1 : -1;
                game.particles.push(new Particle(
                    this.x + 18 * faceDir, this.y - 10,
                    faceDir * (Math.random() * 1.5 + 0.5), -Math.random() * 1.0,
                    "rgba(240, 240, 240, 0.6)",
                    18
                ));
            }
            if (this.stateTimer <= 0) {
                this.state = "charge";
                this.stateTimer = 700; // charge for 700ms
                const dx = player.x - this.x;
                const dy = player.y - this.y;
                const dist = Math.hypot(dx, dy) || 1;
                this.chargeVx = (dx / dist) * 6.5;
                this.chargeVy = (dy / dist) * 6.5;
            }
        } else if (this.state === "charge") {
            this.x += this.chargeVx;
            this.y += this.chargeVy;
            this.stateTimer -= dt;
            
            // Trail particles
            if (Math.random() < 0.4) {
                game.particles.push(new Particle(
                    this.x, this.y + 10,
                    -this.chargeVx * 0.2, (Math.random() - 0.5) * 1.5,
                    "rgba(90, 74, 66, 0.4)",
                    12
                ));
            }
            
            // Stomp on hit boundary or timer end
            const hitWall = this.x <= 20 || this.x >= canvas.width - 20 || this.y <= 25 || this.y >= canvas.height - 25;
            if (this.stateTimer <= 0 || hitWall) {
                this.state = "stomp";
                this.stateTimer = 500; // 500ms stomp animation
                this.stompRadius = 10;
                
                // Screen shake and sound
                triggerScreenShake(4.5);
                sounds.playSFX('hit');
                
                // Shockwave damage to player
                const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);
                if (distToPlayer < 75) {
                    let dmg = 12;
                    if (player.shieldActive) dmg = Math.floor(dmg * 0.2);
                    player.health -= dmg;
                    player.x += (player.x - this.x) > 0 ? 15 : -15; // pushback
                    player.y += (player.y - this.y) > 0 ? 15 : -15;
                    triggerScreenShake(6);
                }
                
                // Shockwave dirt particles
                for (let p = 0; p < 18; p++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = Math.random() * 3.5 + 1.5;
                    game.particles.push(new Particle(
                        this.x, this.y + 15,
                        Math.cos(angle) * speed, Math.sin(angle) * speed,
                        "rgba(139, 115, 85, 0.75)",
                        25
                    ));
                }
            }
        } else if (this.state === "stomp") {
            this.stateTimer -= dt;
            this.stompRadius += 3.0; // expand shockwave circle
            if (this.stateTimer <= 0) {
                this.state = "walk";
                this.stateTimer = Math.random() * 2000 + 2000;
            }
        }

        // Keep in bounds
        this.x = Math.max(20, Math.min(canvas.width - 20, this.x));
        this.y = Math.max(25, Math.min(canvas.height - 25, this.y));
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Facing direction
        const faceRight = (this.state === "charge") ? (this.chargeVx > 0) : (game.player.x > this.x);
        if (!faceRight) {
            ctx.scale(-1, 1);
        }

        // Stomp shockwave circle
        if (this.state === "stomp") {
            ctx.strokeStyle = "rgba(255, 235, 120, 0.4)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 15, this.stompRadius, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Warning reddish flash
        if (this.state === "prep" && Math.floor(this.prepFlash / 100) % 2 === 0) {
            ctx.fillStyle = "rgba(229, 62, 62, 0.4)";
            ctx.beginPath();
            ctx.arc(0, -10, 32, 0, Math.PI * 2);
            ctx.fill();
        }

        // --- DRAW RETRO ELK ---
        // Legs
        ctx.fillStyle = "#3e322b"; // darker hooves/legs
        const legSwing = Math.sin(this.walkTimer) * 8;
        // Front legs
        ctx.fillRect(8, 0, 4, 18 + (this.state === "walk" ? legSwing : 0));
        ctx.fillRect(14, 0, 4, 18 + (this.state === "walk" ? -legSwing : 0));
        // Back legs
        ctx.fillRect(-18, 0, 4, 18 + (this.state === "walk" ? -legSwing : 0));
        ctx.fillRect(-12, 0, 4, 18 + (this.state === "walk" ? legSwing : 0));

        // Body
        ctx.fillStyle = this.primaryColor;
        ctx.fillRect(-22, -16, 38, 22);
        
        // Neck & Head
        ctx.save();
        ctx.translate(14, -12);
        ctx.rotate(-0.35);
        ctx.fillStyle = this.primaryColor;
        ctx.fillRect(0, -12, 10, 16); // Neck
        ctx.fillStyle = "#4a3c35"; // Head
        ctx.fillRect(4, -18, 16, 10); // Snout
        
        // Eye
        ctx.fillStyle = this.state === "prep" || this.state === "charge" ? "#ff3333" : "#1a1a1a";
        ctx.fillRect(10, -15, 2, 2);

        // Massive Antlers (tan/beige color)
        ctx.strokeStyle = "#d2b48c";
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        // Main beam
        ctx.moveTo(0, -18);
        ctx.lineTo(-12, -32);
        // Tines
        ctx.moveTo(-4, -22);
        ctx.lineTo(4, -30);
        ctx.moveTo(-7, -26);
        ctx.lineTo(-1, -36);
        ctx.moveTo(-10, -29);
        ctx.lineTo(-6, -40);
        ctx.stroke();

        ctx.restore();

        ctx.restore();
    }
}

// Lvl 7: Metallic ABBA robot shooting lasers
class ABBAbot extends Enemy {
    constructor(x, y) {
        super(x, y, "abbabot");
        this.health = 80;
        this.speed = 1.1;
        this.primaryColor = "#cbd5e0"; // silver
        this.shootCooldown = Math.random() * 1500 + 800;
        this.pulseAngle = 0;
    }

    update(dt, player, canvas, projectiles) {
        super.update(dt, player, canvas, projectiles);
        this.pulseAngle += 0.08;
        
        // Shoot disco light laser balls
        this.shootCooldown -= dt;
        if (this.shootCooldown <= 0) {
            this.shootCooldown = 2200;
            
            // Fire in 3-way spread towards Sven
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.hypot(dx, dy);
            
            const baseAngle = Math.atan2(dy, dx);
            const spread = 0.25; // radians
            
            const angles = [baseAngle - spread, baseAngle, baseAngle + spread];
            
            angles.forEach(ang => {
                const vx = Math.cos(ang) * 4;
                const vy = Math.sin(ang) * 4;
                projectiles.push(new LaserBall(this.x, this.y, vx, vy));
            });
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Glowing disco aura
        const glowRad = 20 + Math.sin(this.pulseAngle) * 5;
        const discoGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, glowRad);
        discoGrad.addColorStop(0, "rgba(236,72,153,0.3)");
        discoGrad.addColorStop(1, "rgba(124,58,237,0)");
        ctx.fillStyle = discoGrad;
        ctx.beginPath();
        ctx.arc(0, 0, glowRad, 0, Math.PI * 2);
        ctx.fill();
        
        // Silver Disco Bot torso (chrome jumpsuit look)
        ctx.fillStyle = "#cbd5e0";
        ctx.fillRect(-14, -16, 28, 32);
        ctx.strokeStyle = "#ec4899"; // pink neon highlights
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-14, -16, 28, 32);
        
        // 70s Flare cuffs
        ctx.fillStyle = "#a0aec0";
        ctx.fillRect(-18, 8, 4, 10);
        ctx.fillRect(14, 8, 4, 10);
        
        // Disco ball head
        ctx.fillStyle = "#e2e8f0";
        ctx.beginPath();
        ctx.arc(0, -22, 10, 0, Math.PI*2);
        ctx.fill();
        // Draw specular mirror grid on head
        ctx.strokeStyle = "#a0aec0";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(-10, -22); ctx.lineTo(10, -22);
        ctx.moveTo(0, -32); ctx.lineTo(0, -12);
        ctx.stroke();
        
        // Pink retro visor
        ctx.fillStyle = "#ec4899";
        ctx.fillRect(-6, -24, 12, 4);
        
        ctx.restore();
    }
}

// Neon-glowing Raver enemy class (Level 6: Avicii Rave)
class Raver extends Enemy {
    constructor(x, y) {
        super(x, y, "raver");
        this.health = 70;
        this.speed = 1.6;
        this.primaryColor = "#00ffff"; // Cyan neon glow
        this.glowTimer = 0;
        this.throwCooldown = Math.random() * 1200 + 800;
        this.danceTimer = Math.random() * 100;
    }

    update(dt, player, canvas, projectiles) {
        if (this.damageCooldown > 0) this.damageCooldown -= dt;
        
        this.danceTimer += 0.08;
        // Hopping / dancing movement towards Sven
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.hypot(dx, dy);
        
        const danceX = Math.sin(this.danceTimer * 1.5) * 1.2;
        const danceY = Math.abs(Math.cos(this.danceTimer)) * -2.0; // hopping up and down
        
        if (dist > 5) {
            this.x += ((dx / dist) * this.speed) + danceX;
            this.y += ((dy / dist) * this.speed) + danceY;
        } else {
            this.x += danceX;
            this.y += danceY;
        }
        
        this.x = Math.max(15, Math.min(canvas.width - 15, this.x));
        this.y = Math.max(20, Math.min(canvas.height - 20, this.y));
        
        // Throw neon glowsticks
        this.throwCooldown -= dt;
        if (this.throwCooldown <= 0) {
            this.throwCooldown = Math.random() * 1800 + 1200;
            const safeDist = dist || 1;
            const vx = (dx / safeDist) * 4.5;
            const vy = (dy / safeDist) * 4.5;
            projectiles.push(new Glowstick(this.x, this.y, vx, vy));
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        this.glowTimer += 0.1;
        const glowColor = `hsl(${(Date.now() / 10) % 360}, 100%, 60%)`;
        
        // Body (neon hoodie)
        ctx.fillStyle = glowColor;
        ctx.fillRect(-12, -18, 24, 36);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.strokeRect(-12, -18, 24, 36);
        
        // Head
        ctx.fillStyle = "#ffd8b1";
        ctx.beginPath();
        ctx.arc(0, -22, 8, 0, Math.PI*2);
        ctx.fill();
        
        // Shutter shades (cyan/pink bars across eyes)
        ctx.fillStyle = "#00ffff";
        ctx.fillRect(-6, -24, 12, 3);
        ctx.fillStyle = "#ff00ff";
        ctx.fillRect(-6, -20, 12, 1);
        
        // Glowsticks in hand
        ctx.strokeStyle = "#39ff14"; // neon green glowstick
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(10, -5);
        ctx.lineTo(18, -12);
        ctx.stroke();
        
        ctx.restore();
    }
}

// Glowstick projectile class thrown by Ravers
class Glowstick {
    constructor(x, y, vx, vy) {
        this.x = x;
        this.y = y;
        this.width = 16;
        this.height = 4;
        this.vx = vx;
        this.vy = vy;
        this.isPlayerOwned = false;
        this.damage = 10;
        this.lifetime = 3500;
        this.rotation = 0;
        const colors = ["#ff00ff", "#00ffff", "#39ff14", "#ffff00"];
        this.color = colors[Math.floor(Math.random() * colors.length)];
    }
    update(dt) {
        this.x += this.vx;
        this.y += this.vy;
        this.rotation += 0.25;
        this.lifetime -= dt;
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 4;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(8, 0);
        ctx.stroke();
        
        ctx.restore();
    }
}

// Prison Guard enemy class (Level 6: Kvinnafängelset)
class Guard extends Enemy {
    constructor(x, y) {
        super(x, y, "guard");
        this.health = 85; 
        this.speed = 1.0; 
        this.primaryColor = "#4a5568"; 
        this.throwCooldown = Math.random() * 1000 + 1000;
        this.walkTimer = 0;
    }

    update(dt, player, canvas, projectiles) {
        super.update(dt, player, canvas, projectiles);
        this.walkTimer += 0.05;
        
        // Clamp to screen bounds
        this.x = Math.max(15, Math.min(canvas.width - 15, this.x));
        this.y = Math.max(20, Math.min(canvas.height - 20, this.y));
        
        this.throwCooldown -= dt;
        if (this.throwCooldown <= 0) {
            this.throwCooldown = Math.random() * 2200 + 1800;
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.hypot(dx, dy) || 1;
            const vx = (dx / dist) * 5.0;
            const vy = (dy / dist) * 5.0;
            projectiles.push(new Handcuffs(this.x, this.y, vx, vy));
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(Math.sin(this.walkTimer) * 0.05);
        ctx.fillStyle = "#2d3748"; 
        ctx.fillRect(-15, -20, 30, 40);
        ctx.strokeStyle = "#4a5568";
        ctx.lineWidth = 1;
        ctx.strokeRect(-15, -20, 30, 40);
        ctx.fillStyle = "hsl(47, 100%, 50%)"; 
        ctx.beginPath();
        ctx.moveTo(4, -8);
        ctx.lineTo(8, -8);
        ctx.lineTo(6, -2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#ffd8b1";
        ctx.beginPath();
        ctx.arc(0, -22, 9, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = "#1a202c";
        ctx.fillRect(-11, -31, 22, 4);
        ctx.fillStyle = "hsl(47, 100%, 50%)"; 
        ctx.fillRect(-11, -28, 22, 1);
        ctx.strokeStyle = "#1a202c";
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(-20, 8);
        ctx.stroke();
        ctx.restore();
    }
}

// Handcuffs projectile class thrown by Guards
class Handcuffs {
    constructor(x, y, vx, vy) {
        this.x = x;
        this.y = y;
        this.width = 18;
        this.height = 10;
        this.vx = vx;
        this.vy = vy;
        this.isPlayerOwned = false;
        this.damage = 8;
        this.lifetime = 4000;
        this.rotation = 0;
    }
    update(dt) {
        this.x += this.vx;
        this.y += this.vy;
        this.rotation += 0.3;
        this.lifetime -= dt;
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.strokeStyle = "#cbd5e0"; 
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(-5, 0, 5, 0, Math.PI*2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(5, 0, 5, 0, Math.PI*2);
        ctx.stroke();
        ctx.strokeStyle = "#a0aec0";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-2, 0);
        ctx.lineTo(2, 0);
        ctx.stroke();
        ctx.restore();
    }
}

// 4. POWER-UP FOOD ITEMS

class MeatballItem {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 16;
        this.height = 16;
        this.type = "meatball";
        this.bobOffset = (Math.floor(x) * 31 + Math.floor(y)) % 100;
        this.color = "#c53030";
    }
    update(dt) {
        // floating effect
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y + Math.sin(Date.now() / 200 + this.bobOffset) * 4);
        
        // Brown meatball sphere
        ctx.fillStyle = "#5c4033"; // deep meatball brown
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        
        // Creamy sauce glaze highlight
        ctx.fillStyle = "#f5deb3"; // wheat sauce
        ctx.beginPath();
        ctx.arc(-2, -2, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Red Lingonberry jam dot beside it
        ctx.fillStyle = "#c53030";
        ctx.beginPath();
        ctx.arc(6, 6, 4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
}

class KnackebrodItem {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 18;
        this.height = 18;
        this.type = "knackebrod";
        this.bobOffset = (Math.floor(x) * 31 + Math.floor(y)) % 100;
        this.color = "#d2b48c";
    }
    update(dt) {}
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y + Math.sin(Date.now() / 200 + this.bobOffset) * 4);
        
        // Rectangular hard crispbread
        ctx.fillStyle = "#d2b48c"; // tan crispbread
        ctx.fillRect(-9, -9, 18, 18);
        ctx.strokeStyle = "#8b5a2b";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-9, -9, 18, 18);
        
        // Little pricked holes
        ctx.fillStyle = "#8b5a2b";
        ctx.fillRect(-5, -5, 2, 2);
        ctx.fillRect(3, -5, 2, 2);
        ctx.fillRect(-2, 0, 2, 2);
        ctx.fillRect(-5, 4, 2, 2);
        ctx.fillRect(3, 4, 2, 2);
        
        ctx.restore();
    }
}

// 5. EXIT PORTALS & MAYPOLES

class ExitPortal {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 40;
        this.height = 80;
        this.active = false;
        this.pulse = 0;
    }

    activate() {
        this.active = true;
    }

    update(dt) {
        if (this.active) {
            this.pulse += 0.05;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        if (this.active) {
            // Glowing portals (blue/yellow energy bands)
            const scale = 1.0 + Math.sin(this.pulse) * 0.05;
            ctx.scale(scale, scale);
            
            const portalGrad = ctx.createLinearGradient(-20, 0, 20, 0);
            portalGrad.addColorStop(0, "hsl(205, 100%, 45%)");
            portalGrad.addColorStop(0.5, "hsl(47, 100%, 50%)");
            portalGrad.addColorStop(1, "hsl(205, 100%, 45%)");
            
            ctx.fillStyle = portalGrad;
            ctx.shadowColor = "hsl(205, 100%, 45%)";
            ctx.shadowBlur = 20;
            
            // Draw portal capsule
            ctx.beginPath();
            ctx.arc(0, -this.height/2 + this.width/2, this.width/2, Math.PI, 0);
            ctx.lineTo(this.width/2, this.height/2 - this.width/2);
            ctx.arc(0, this.height/2 - this.width/2, this.width/2, 0, Math.PI);
            ctx.lineTo(-this.width/2, -this.height/2 + this.width/2);
            ctx.closePath();
            ctx.fill();
            
            // Draw floating Swedish flag stripes in portal
            ctx.fillStyle = "rgba(255,255,255,0.3)";
            ctx.fillRect(-15, -10, 30, 4);
            ctx.fillRect(-15, 10, 30, 4);
        } else {
            // Inactive closed gate (grey monolith)
            ctx.fillStyle = "#4a5568";
            ctx.fillRect(-15, -this.height/2, 30, this.height);
            ctx.strokeStyle = "#2d3748";
            ctx.lineWidth = 3;
            ctx.strokeRect(-15, -this.height/2, 30, this.height);
            
            // Locked keyhole design
            ctx.fillStyle = "#cbd5e0";
            ctx.beginPath();
            ctx.arc(0, 0, 6, 0, Math.PI*2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(-3, 0);
            ctx.lineTo(3, 0);
            ctx.lineTo(6, 12);
            ctx.lineTo(-6, 12);
            ctx.closePath();
            ctx.fill();
        }
        
        ctx.restore();
    }
}

class Maypole {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 50;
        this.height = 120;
        this.pulse = 0;
    }

    update(dt) {
        this.pulse += 0.04;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Maypole post (green wooden structure)
        ctx.fillStyle = "#276749"; // forest green pole
        ctx.fillRect(-6, -60, 12, 120);
        
        // Crossbar
        ctx.fillRect(-35, -30, 70, 10);
        
        // Hanging green rings decorated with leaves
        ctx.strokeStyle = "#48bb78"; // light green leaf ring
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(-22, -10, 12, 0, Math.PI*2);
        ctx.arc(22, -10, 12, 0, Math.PI*2);
        ctx.stroke();
        
        // Wreath yellow ribbon overlays
        ctx.strokeStyle = "hsl(47, 100%, 50%)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(-22, -10, 13, 0, Math.PI*2);
        ctx.arc(22, -10, 13, 0, Math.PI*2);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Ribbon streamers wrapped down the pole
        ctx.strokeStyle = "hsl(47, 100%, 50%)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-6, -60);
        ctx.quadraticCurveTo(0, -30, 6, 0);
        ctx.quadraticCurveTo(0, 30, -6, 60);
        ctx.stroke();
        
        ctx.strokeStyle = "hsl(205, 100%, 45%)";
        ctx.beginPath();
        ctx.moveTo(6, -60);
        ctx.quadraticCurveTo(0, -30, -6, 0);
        ctx.quadraticCurveTo(0, 30, 6, 60);
        ctx.stroke();
        
        // Solstice glowing light circle at bottom (Maypole base portal)
        const glowRad = 35 + Math.sin(this.pulse) * 4;
        const mayGrad = ctx.createRadialGradient(0, 40, 5, 0, 40, glowRad);
        mayGrad.addColorStop(0, "rgba(255, 235, 100, 0.5)");
        mayGrad.addColorStop(0.7, "rgba(0, 106, 167, 0.2)");
        mayGrad.addColorStop(1, "rgba(0,0,0,0)");
        
        ctx.fillStyle = mayGrad;
        ctx.beginPath();
        ctx.arc(0, 40, glowRad, 0, Math.PI*2);
        ctx.fill();
        
        ctx.restore();
    }
}

// 6. VISUAL PARTICLE EFFECT (Explosions/Splatter)
class Particle {
    constructor(x, y, vx, vy, color, maxLife) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.maxLife = maxLife; // frames
        this.life = maxLife;
        this.size = Math.random() * 4 + 2;
    }

    update(dt) {
        this.x += this.vx;
        this.y += this.vy;
        
        // Apply friction/drag
        this.vx *= 0.95;
        this.vy *= 0.95;
        
        this.life--;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.life / this.maxLife;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}


// --- INITIALIZE GAME INSTANCE ---
const game = new Game();

// Load WebAssembly, then kick off the game loop
initWasm().then(() => {
    requestAnimationFrame((t) => game.run(t));
});
