let currentSoundSet;
let volume = 0.7; // Default volume is 70%
let audioCtx = new (window.AudioContext || window.webkitAudioContext)(); // Create a single AudioContext
let oscillators = {}; // Store oscillators for each key

// Load the initial soundSet and volume
chrome.storage.sync.get(['soundSet', 'volume'], (result) => {
    const soundSet = result.soundSet || 'medium'; // Default to medium if undefined
    volume = result.volume !== undefined ? result.volume / 100 : 0.7;

    currentSoundSet = soundSet;
});

export const tone = {
    C: [16.35, 32.7, 65.41, 130.81, 261.63, 523.25, 1046.5, 2093.0, 4186.01],
    Db: [17.32, 34.65, 69.3, 138.59, 277.18, 554.37, 1108.73, 2217.46, 4434.92],
    D: [18.35, 36.71, 73.42, 146.83, 293.66, 587.33, 1174.66, 2349.32, 4698.64],
    Eb: [19.45, 38.89, 77.78, 155.56, 311.13, 622.25, 1244.51, 2489.02, 4978.03],
    E: [20.6, 41.2, 82.41, 164.81, 329.63, 659.26, 1318.51, 2637.02],
    F: [21.83, 43.65, 87.31, 174.61, 349.23, 698.46, 1396.91, 2793.83],
    Gb: [23.12, 46.25, 92.5, 185.0, 369.99, 739.99, 1479.98, 2959.96],
    G: [24.5, 49.0, 98.0, 196.0, 392.0, 783.99, 1567.98, 3135.96],
    Ab: [25.96, 51.91, 103.83, 207.65, 415.3, 830.61, 1661.22, 3322.44],
    A: [27.5, 55.0, 110.0, 220.0, 440.0, 880.0, 1760.0, 3520.0],
    Bb: [29.14, 58.27, 116.54, 233.08, 466.16, 932.33, 1864.66, 3729.31],
    B: [30.87, 61.74, 123.47, 246.94, 493.88, 987.77, 1975.53, 3951.07],
}

const keyToTone = {
    A: tone.C[4],  // C4
    S: tone.D[4],  // D4
    D: tone.E[4],  // E4
    F: tone.F[4],  // F4
    G: tone.G[4],  // G4
    H: tone.A[4],  // A4
    J: tone.B[4],  // B4
    K: tone.C[5],  // C5
    L: tone.D[5],  // D5

    Q: tone.E[5],  // E5
    W: tone.F[5],  // F5
    E: tone.G[5],  // G5
    R: tone.A[5],  // A5
    T: tone.B[5],  // B5
    Y: tone.C[6],  // C6
    U: tone.D[6],  // D6
    I: tone.E[6],  // E6
    O: tone.F[6],  // F6
    P: tone.G[6],  // G6

    Z: tone.A[3],  // A3
    X: tone.B[3],  // B3
    C: tone.C[4],  // C4
    V: tone.D[4],  // D4
    B: tone.E[4],  // E4
    N: tone.F[4],  // F4
    M: tone.G[4],  // G4
};

function getMusicalConfig() {
    return {
        ...keyToTone,
        default: tone.C[4]
    }
}

// Function to get the sound configuration for the current sound set
function getSoundConfig(soundSet) {
    const soundConfig = {
        typewriter: {
            default: 'assets/sounds/typewriter/key-press.wav',
            Enter: 'assets/sounds/typewriter/enter-key.wav',
        },
        soft: {
            default: 'assets/sounds/keyboard/soft.wav',
        },
        medium: {
            default: 'assets/sounds/keyboard/medium.wav',
        },
        hard: {
            default: 'assets/sounds/keyboard/hard.wav',
        },
        musical: getMusicalConfig()
    };
    return soundConfig[soundSet];
}

// Listen for storage changes (i.e., when the user updates soundSet or volume)
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        if (changes.soundSet) {
            currentSoundSet = changes.soundSet.newValue;
        }
        if (changes.volume) {
            volume = changes.volume.newValue / 100; // Update volume dynamically
        }
    }
});

// Play the appropriate sound based on keypress
document.addEventListener('keydown', (event) => {
    if (currentSoundSet && !oscillators[event.key]) {
        const soundConfig = getSoundConfig(currentSoundSet);
        let soundFileOrFreq = soundConfig[event.key.toUpperCase()] ?? soundConfig["default"];

        if (currentSoundSet == "musical") {
            playTone(soundFileOrFreq, event.key);
        } else {
            const audioFileURL = chrome.runtime.getURL(soundFileOrFreq);
            const audio = new Audio(audioFileURL);
            audio.volume = volume;
            audio.play().catch((error) => console.error(`Failed to play ${event.key} sound:`, error));
        }
    }
});

document.addEventListener('keyup', (event) => {
    if (currentSoundSet === "musical" && oscillators[event.key]) {
        stopTone(event.key); // Stop the tone when the key is released
    }
});

// Function to play a tone at a specific frequency
function playTone(frequency, key) {
    const gainNode = audioCtx.createGain();
    const oscillator = audioCtx.createOscillator();

    oscillator.type = 'sine'; // You can change this to other wave types like 'square', 'triangle', etc.
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime); // Set the frequency to play the correct note

    gainNode.gain.setValueAtTime(0, audioCtx.currentTime); // Start with volume at 0
    gainNode.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + 0.05); // Fade in over 50ms

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillators[key] = { oscillator, gainNode }; // Store the oscillator to stop it later
}

// Function to stop the tone for a given key
function stopTone(key) {
    if (oscillators[key]) {
        const { oscillator, gainNode } = oscillators[key];
        gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1); // Fade out over 100ms
        oscillator.stop(audioCtx.currentTime + 0.1); // Stop after fading out
        delete oscillators[key]; // Remove the oscillator from the active list
    }
}
