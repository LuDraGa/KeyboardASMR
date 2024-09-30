let currentSoundSet;
let volume = 0.7; // Default volume is 70%
let isMuted = false

// Load the initial soundSet and volume
chrome.storage.sync.get(['soundSet', 'volume', 'isMuted'], (result) => {
    const soundSet = result.soundSet || 'medium'; // Default to medium if undefined
    volume = result.volume !== undefined ? result.volume / 100 : 0.7;
    isMuted = result.isMuted ?? false;

    currentSoundSet = getSoundConfig(soundSet);
});

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
        }
    };
    return soundConfig[soundSet];
}

// Listen for storage changes (i.e., when the user updates soundSet or volume)
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        if (changes.soundSet) {
            currentSoundSet = getSoundConfig(changes.soundSet.newValue);
        }
        if (changes.volume) {
            volume = changes.volume.newValue / 100; // Update volume dynamically
        }
        if (changes.isMuted) {
            isMuted = changes.isMuted.newValue; // Update volume dynamically
        }

    }
});

// Play the appropriate sound based on keypress
document.addEventListener('keydown', (event) => {
    let soundFile = currentSoundSet[event.key] || currentSoundSet.default;
    if (soundFile && !isMuted) {
        const audioFileURL = chrome.runtime.getURL(soundFile);
        const audio = new Audio(audioFileURL);
        audio.volume = volume; // Apply the current volume
        audio.play().catch((error) => console.error(`Failed to play ${event.key} sound:`, error));
    }
});
