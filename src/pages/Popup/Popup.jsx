import React, { useState, useEffect, useRef } from 'react';
import './Popup.css';
import { DEFAULT_SETTINGS, MESSAGE_TYPES, STORAGE_KEYS, SOUND_SETS } from '../../shared/config';
import { profileLoader } from '../../utils/profileLoader';

const Popup = () => {
  const [soundSet, setSoundSet] = useState(DEFAULT_SETTINGS.soundSet);
  const [volume, setVolume] = useState(DEFAULT_SETTINGS.volume * 100);
  const [isMuted, setIsMuted] = useState(DEFAULT_SETTINGS.isMuted);
  const [theme, setTheme] = useState('dark');
  const [isPlaying, setIsPlaying] = useState(null);
  const [soundProfiles, setSoundProfiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const audioContext = useRef(null);
  const soundBuffers = useRef({});

  useEffect(() => {
    const initialize = async () => {
      // Load profiles first
      try {
        const profiles = await profileLoader.loadBundledProfiles();
        setSoundProfiles(profiles);
      } catch (error) {
        console.error('Failed to load profiles:', error);
      }

      // Load settings
      chrome.storage.sync.get([
        STORAGE_KEYS.SOUND_SET,
        STORAGE_KEYS.VOLUME,
        STORAGE_KEYS.IS_MUTED,
        STORAGE_KEYS.THEME
      ], (result) => {
        if (result[STORAGE_KEYS.SOUND_SET]) setSoundSet(result[STORAGE_KEYS.SOUND_SET]);
        if (result[STORAGE_KEYS.VOLUME] !== undefined) setVolume(result[STORAGE_KEYS.VOLUME]);
        if (result[STORAGE_KEYS.IS_MUTED] !== undefined) setIsMuted(result[STORAGE_KEYS.IS_MUTED]);
        if (result[STORAGE_KEYS.THEME]) setTheme(result[STORAGE_KEYS.THEME]);
      });

      // Initialize audio context for preview
      await initAudio();
      setIsLoading(false);
    };

    initialize();
  }, []);

  const initAudio = async () => {
    try {
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
      await loadSounds();
    } catch (error) {
      console.error('Failed to initialize audio:', error);
    }
  };

  const loadSounds = async () => {
    const loadSound = async (url) => {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return await audioContext.current.decodeAudioData(arrayBuffer);
      } catch (error) {
        console.error(`Error loading sound: ${url}`, error);
        return null;
      }
    };

    // Load sounds for each profile
    for (const profile of soundProfiles) {
      soundBuffers.current[profile.id] = {};

      // Load each audio source for this profile
      for (const [sourceId, sourceConfig] of Object.entries(profile.audio_sources)) {
        try {
          const audioUrl = await profileLoader.resolveAudioUrl(sourceConfig);
          soundBuffers.current[profile.id][sourceId] = await loadSound(audioUrl);
        } catch (error) {
          console.warn(`Failed to load sound ${sourceId} for profile ${profile.id}:`, error);
        }
      }
    }
  };

  const playPreviewSound = (profileId) => {
    if (!audioContext.current || !soundBuffers.current[profileId]) return;

    const profile = soundProfiles.find(p => p.id === profileId);
    if (!profile) return;

    setIsPlaying(profileId);

    // Get the default sound source for preview
    const defaultSourceId = profile.key_mappings.default;
    const buffer = soundBuffers.current[profileId][defaultSourceId];

    if (!buffer) return;

    const source = audioContext.current.createBufferSource();
    const gainNode = audioContext.current.createGain();

    source.buffer = buffer;
    gainNode.gain.value = volume / 100;

    source.connect(gainNode);
    gainNode.connect(audioContext.current.destination);
    source.start(0);

    source.onended = () => setIsPlaying(null);
  };

  const handleSoundSetChange = (profileId) => {
    setSoundSet(profileId);
    chrome.storage.sync.set({ [STORAGE_KEYS.SOUND_SET]: profileId });
    playPreviewSound(profileId);
  };

  const handleVolumeChange = (event) => {
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
      isMuted: muteState
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
      <div className="header">
        <div className="logo-section">
          <span className="logo">⌨️</span>
          <div>
            <h1>Keyboard ASMR</h1>
            <p className="tagline">Indulge in your typing experience</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      {/* Sound Profiles */}
      <div className="sound-profiles">
        <h2>Sound Profiles</h2>
        <div className="profiles-grid">
          {isLoading ? (
            <div className="loading-state">Loading profiles...</div>
          ) : (
            soundProfiles.map((profile) => (
            <div
              key={profile.id}
              className={`profile-card ${soundSet === profile.id ? 'active' : ''} ${
                isPlaying === profile.id ? 'playing' : ''
              }`}
              onClick={() => handleSoundSetChange(profile.id)}
              style={{ '--gradient': profile.ui.color }}
            >
              <div className="profile-icon">{profile.ui.icon}</div>
              <div className="profile-info">
                <h3>{profile.name}</h3>
                <p>{profile.description}</p>
              </div>
              {soundSet === profile.id && (
                <div className="active-indicator">
                  <span className="checkmark">✓</span>
                </div>
              )}
              {isPlaying === profile.id && (
                <div className="sound-waves">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              )}
            </div>
            ))
          )}
        </div>
      </div>

      {/* Volume Control */}
      <div className="volume-section">
        <div className="volume-header">
          <h2>Volume Control</h2>
          <button 
            className={`mute-toggle ${isMuted ? 'muted' : ''}`}
            onClick={toggleMute}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
        </div>
        <div className="volume-control">
          <span className="volume-icon">🔈</span>
          <div className="volume-slider-container">
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={handleVolumeChange}
              className="volume-slider"
              disabled={isMuted}
              style={{
                '--volume-percent': `${volume}%`,
              }}
            />
            <div className="volume-value">{volume}%</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="footer">
        <a 
          href="https://chromewebstore.google.com/detail/keyboard-asmr/aebnkjebahjkkpiknggemolakkjggiab"
          target="_blank"
          rel="noopener noreferrer"
          className="review-link"
        >
          <span className="review-icon">⭐</span>
          <span className="review-text">Enjoying Keyboard ASMR? Leave a review!</span>
        </a>
      </div>
    </div>
  );
};

export default Popup;