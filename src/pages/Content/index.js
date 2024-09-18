chrome.storage.sync.get(['soundSet'], (result) => {
    const soundSet = result.soundSet || 'default';

    // Default sound files for each sound set
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

    // Fallback to 'default' sound if no specific key sound is found
    const currentSoundSet = soundConfig[soundSet] || soundConfig['typewriter']; // Fallback to 'typewriter' if not found

    document.addEventListener('keydown', (event) => {
        let soundFile = currentSoundSet[event.key] || currentSoundSet.default;
        const audio = new Audio(chrome.runtime.getURL(soundFile));
        audio.play();
    });
});
