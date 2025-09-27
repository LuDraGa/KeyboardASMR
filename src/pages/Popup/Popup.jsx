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
        (result) => {
          setSoundSet(result[STORAGE_KEYS.SOUND_SET] || DEFAULT_SETTINGS.soundSet);
          if (result[STORAGE_KEYS.VOLUME] !== undefined) setVolume(result[STORAGE_KEYS.VOLUME]);
          if (result[STORAGE_KEYS.IS_MUTED] !== undefined) setIsMuted(result[STORAGE_KEYS.IS_MUTED]);
          if (result[STORAGE_KEYS.THEME]) setTheme(result[STORAGE_KEYS.THEME]);
        }
      );

      setIsLoading(false);
    };

    initialize();
  }, []);

  const handleSoundSetChange = (profileId) => {
    setSoundSet(profileId);
    chrome.storage.sync.set({ [STORAGE_KEYS.SOUND_SET]: profileId });
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
                className={`profile-card ${soundSet === profile.id ? 'active' : ''}`}
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
              </div>
            ))
          )}
        </div>
      </div>

      {/* Volume Control */}
      <div className="volume-section">
        <div className="volume-header">
          <h2>Volume Control</h2>
          <button className={`mute-toggle ${isMuted ? 'muted' : ''}`} onClick={toggleMute}>
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
