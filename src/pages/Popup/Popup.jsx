import React, { useState, useEffect } from 'react';
import './Popup.css';
import { DEFAULT_SETTINGS, MESSAGE_TYPES, STORAGE_KEYS } from '../../shared/config';
import { profileLoader } from '../../utils/profileLoader';

const Popup = () => {
  const [soundSet, setSoundSet] = useState(DEFAULT_SETTINGS.soundSet);
  const [volume, setVolume] = useState(DEFAULT_SETTINGS.volume * 100);
  const [isMuted, setIsMuted] = useState(DEFAULT_SETTINGS.isMuted);
  const [theme, setTheme] = useState('dark');
  const [soundProfiles, setSoundProfiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Audio context for sound preview
  const [audioContext, setAudioContext] = useState(null);
  const [soundBuffers, setSoundBuffers] = useState({});
  const [audioInitialized, setAudioInitialized] = useState(false);

  // Initialize audio context for preview
  const initializeAudio = async () => {
    if (audioInitialized) return audioContext;

    try {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      setAudioContext(context);
      setAudioInitialized(true);
      return context;
    } catch (error) {
      console.error('Failed to initialize audio for preview:', error);
      return null;
    }
  };

  // Load sound for preview
  const loadSoundBuffer = async (profile, context) => {
    // Use the passed context or current audioContext
    const ctx = context || audioContext;
    if (!ctx || soundBuffers[profile.id]) return;

    try {
      // Get the default keydown sound for preview (new format only)
      const defaultMapping = profile.key_mappings.default;
      const audioSourceId = defaultMapping.keydown;

      // Skip if no keydown sound configured
      if (!audioSourceId || audioSourceId === null) {
        return null;
      }

      const defaultAudioSource = profile.audio_sources[audioSourceId];
      const soundUrl = await profileLoader.resolveAudioUrl(defaultAudioSource);

      const response = await fetch(soundUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      setSoundBuffers(prev => ({
        ...prev,
        [profile.id]: audioBuffer,
      }));

      return audioBuffer;
    } catch (error) {
      console.error(`Failed to load sound for ${profile.name}:`, error);
      return null;
    }
  };

  // Play preview sound
  const playPreview = async profile => {
    if (isMuted) return;

    try {
      let context = audioContext;

      // Initialize audio on first user interaction
      if (!audioInitialized) {
        context = await initializeAudio();
      }

      if (!context) return;

      // Resume audio context if needed (Chrome autoplay policy)
      if (context.state === 'suspended') {
        await context.resume();
      }

      // Load sound if not cached, passing the context directly
      let buffer = soundBuffers[profile.id];
      if (!buffer) {
        buffer = await loadSoundBuffer(profile, context);
      }

      if (buffer && context) {
        const source = context.createBufferSource();
        const gainNode = context.createGain();

        source.buffer = buffer;
        // Use current volume setting for preview (convert from 0-100 to 0-1)
        gainNode.gain.value = volume / 100;

        source.connect(gainNode);
        gainNode.connect(context.destination);
        source.start(0);
      }
    } catch (error) {
      console.error('Failed to play preview:', error);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      // Load profiles
      try {
        const profiles = await profileLoader.loadBundledProfiles();
        // Sort profiles alphabetically by display name
        profiles.sort((a, b) => a.name.localeCompare(b.name));
        setSoundProfiles(profiles);
      } catch (error) {
        console.error('Failed to load profiles:', error);
      }

      // Load settings
      chrome.storage.sync.get(
        [STORAGE_KEYS.SOUND_SET, STORAGE_KEYS.VOLUME, STORAGE_KEYS.IS_MUTED, STORAGE_KEYS.THEME],
        result => {
          setSoundSet(result[STORAGE_KEYS.SOUND_SET] || DEFAULT_SETTINGS.soundSet);
          if (result[STORAGE_KEYS.VOLUME] !== undefined) setVolume(result[STORAGE_KEYS.VOLUME]);
          if (result[STORAGE_KEYS.IS_MUTED] !== undefined)
            setIsMuted(result[STORAGE_KEYS.IS_MUTED]);
          if (result[STORAGE_KEYS.THEME]) setTheme(result[STORAGE_KEYS.THEME]);
        }
      );

      setIsLoading(false);
    };

    initialize();
  }, []);

  const handleSoundSetChange = async profileId => {
    // Find the selected profile
    const selectedProfile = soundProfiles.find(profile => profile.id === profileId);

    // Play preview sound first
    if (selectedProfile) {
      await playPreview(selectedProfile);
    }

    // Then update the setting
    setSoundSet(profileId);
    chrome.storage.sync.set({ [STORAGE_KEYS.SOUND_SET]: profileId });
  };

  const handleVolumeChange = event => {
    const newVolume = parseInt(event.target.value, 10);
    setVolume(newVolume);
    chrome.storage.sync.set({ [STORAGE_KEYS.VOLUME]: newVolume });
  };

  const toggleMute = () => {
    const muteState = !isMuted;
    setIsMuted(muteState);
    chrome.storage.sync.set({ [STORAGE_KEYS.IS_MUTED]: muteState });
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.TOGGLE_MUTE,
      isMuted: muteState,
    });
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    chrome.storage.sync.set({ [STORAGE_KEYS.THEME]: newTheme });
  };

  return (
    <div className={`popup-container ${theme}`}>
      {/* Header */}
      <div className='header'>
        <div className='logo-section'>
          <span className='logo'>⌨️</span>
          <div>
            <h1>Keyboard ASMR</h1>
            <p className='tagline'>Indulge in your typing experience</p>
          </div>
        </div>
        <div className='header-actions'>
          <a
            href='https://discord.gg/2jcP6RBTPq'
            target='_blank'
            rel='noopener noreferrer'
            className='icon-btn discord-btn'
            title='Join Discord community'
          >
            <svg width='16' height='16' viewBox='0 0 24 24' fill='currentColor'>
              <path d='M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z' />
            </svg>
          </a>
          <button className='icon-btn' onClick={toggleTheme} title='Toggle theme'>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      {/* Sound Profiles */}
      <div className='sound-profiles'>
        <h2>
          Sound Profiles
          {!isLoading && soundProfiles.length > 0 && (
            <span className='current-profile'>
              {' - '}
              {soundProfiles.find(profile => profile.id === soundSet)?.name || 'Unknown'}
            </span>
          )}
        </h2>
        <div className='profiles-grid'>
          {isLoading ? (
            <div className='loading-state'>Loading profiles...</div>
          ) : (
            soundProfiles.map(profile => (
              <div
                key={profile.id}
                className={`profile-card ${soundSet === profile.id ? 'active' : ''}`}
                onClick={() => handleSoundSetChange(profile.id)}
                style={{ '--gradient': profile.ui.color }}
              >
                <div className='profile-icon'>{profile.ui.icon}</div>
                <div className='profile-info'>
                  <h3>{profile.name}</h3>
                  <p>{profile.description}</p>
                </div>
                {soundSet === profile.id && (
                  <div className='active-indicator'>
                    <span className='checkmark'>✓</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Volume Control */}
      <div className='volume-section'>
        <div className='volume-header'>
          <h2>Volume Control</h2>
          <button className={`mute-toggle ${isMuted ? 'muted' : ''}`} onClick={toggleMute}>
            {isMuted ? '🔇' : '🔊'}
          </button>
        </div>
        <div className='volume-control'>
          <span className='volume-icon'>🔈</span>
          <div className='volume-slider-container'>
            <input
              type='range'
              min='0'
              max='100'
              value={volume}
              onChange={handleVolumeChange}
              className='volume-slider'
              disabled={isMuted}
              style={{
                '--volume-percent': `${volume}%`,
              }}
            />
            <div className='volume-value'>{volume}%</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className='footer'>
        <a
          href='https://chromewebstore.google.com/detail/keyboard-asmr/aebnkjebahjkkpiknggemolakkjggiab'
          target='_blank'
          rel='noopener noreferrer'
          className='review-link'
        >
          <span className='review-icon'>⭐</span>
          <span className='review-text'>Enjoying Keyboard ASMR? Leave a review!</span>
        </a>
      </div>
    </div>
  );
};

export default Popup;
