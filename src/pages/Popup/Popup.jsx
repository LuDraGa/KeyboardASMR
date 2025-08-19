import React, { useState, useEffect, useRef } from 'react';
import './Popup.css';
import { DEFAULT_SETTINGS, MESSAGE_TYPES, STORAGE_KEYS, SOUND_SETS } from '../../shared/config';

const soundProfiles = [
  {
    id: 'typewriter',
    name: 'Typewriter',
    description: 'Classic mechanical',
    icon: '⌨️',
    color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  {
    id: 'soft',
    name: 'Keychron Red',
    description: 'Soft & smooth',
    icon: '🔴',
    color: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  },
  {
    id: 'medium',
    name: 'Keychron  Brown',
    description: 'Tactile bump',
    icon: '🟤',
    color: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  },
  {
    id: 'hard',
    name: 'Keychron Blue',
    description: 'Clicky & loud',
    icon: '🔵',
    color: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
  },
  {
    id: 'drum',
    name: 'Drum Kit',
    description: 'Beat maker',
    icon: '🥁',
    color: 'linear-gradient(135deg,rgb(145, 209, 206) 0%,rgb(11, 129, 123) 100%)',
  },
];

const Popup = () => {
  const [soundSet, setSoundSet] = useState(DEFAULT_SETTINGS.soundSet);
  const [volume, setVolume] = useState(DEFAULT_SETTINGS.volume * 100);
  const [isMuted, setIsMuted] = useState(DEFAULT_SETTINGS.isMuted);
  const [theme, setTheme] = useState('dark');
  const [isPlaying, setIsPlaying] = useState(null);
  const audioContext = useRef(null);
  const soundBuffers = useRef({});

  useEffect(() => {
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
    initAudio();
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
        const response = await fetch(chrome.runtime.getURL(url));
        const arrayBuffer = await response.arrayBuffer();
        return await audioContext.current.decodeAudioData(arrayBuffer);
      } catch (error) {
        console.error(`Error loading sound: ${url}`, error);
        return null;
      }
    };

    for (const [setName, sounds] of Object.entries(SOUND_SETS)) {
      soundBuffers.current[setName] = {};
      for (const [key, path] of Object.entries(sounds)) {
        soundBuffers.current[setName][key] = await loadSound(path);
      }
    }
  };

  const playPreviewSound = (profileId) => {
    if (!audioContext.current || !soundBuffers.current[profileId]) return;

    setIsPlaying(profileId);
    const buffer = soundBuffers.current[profileId].default || soundBuffers.current[profileId].Enter;
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
          {soundProfiles.map((profile) => (
            <div
              key={profile.id}
              className={`profile-card ${soundSet === profile.id ? 'active' : ''} ${
                isPlaying === profile.id ? 'playing' : ''
              }`}
              onClick={() => handleSoundSetChange(profile.id)}
              style={{ '--gradient': profile.color }}
            >
              <div className="profile-icon">{profile.icon}</div>
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
          ))}
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
      </div>
    </div>
  );
};

export default Popup;