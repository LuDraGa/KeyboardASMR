import React, { useState, useEffect } from 'react';
import './Popup.css';
import { FaSun, FaMoon } from 'react-icons/fa'; // Import icons
import { DEFAULT_SETTINGS, MESSAGE_TYPES, STORAGE_KEYS } from '../../shared/config';

const soundSetOptions = [
  { value: 'typewriter', label: 'Typewriter' },
  { value: 'soft', label: 'Keychron Red' },
  { value: 'medium', label: 'Keychron Brown' },
  { value: 'hard', label: 'Keychron Blue' },
  // { value: 'soft', label: 'Beats' },
  // { value: 'soft', label: 'Lofi' },
  // { value: 'soft', label: 'Harmonica' },
];

const Popup = () => {
  const [soundSet, setSoundSet] = useState(DEFAULT_SETTINGS.soundSet);
  const [volume, setVolume] = useState(DEFAULT_SETTINGS.volume * 100);
  const [isMuted, setIsMuted] = useState(DEFAULT_SETTINGS.isMuted);
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
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
  }, []);

  const handleSoundSetChange = (event) => {
    const newSoundSet = event.target.value;
    setSoundSet(newSoundSet);
    chrome.storage.sync.set({ [STORAGE_KEYS.SOUND_SET]: newSoundSet });
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
    // Notify background script about mute toggle
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
      <div className="header">
        <h3>
          Keyboard Sound Options &nbsp;
          <button onClick={toggleTheme} className="theme-toggle-button">
            {theme === 'dark' ? <FaSun /> : <FaMoon />}
          </button>
        </h3>
      </div>

      <div className="form-group">
        <label>Select a Sound Profile:</label>
        <select value={soundSet} onChange={handleSoundSetChange} className="dropdown">
          {soundSetOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>
          Sound Volume: {volume}%{' '}
          <button onClick={toggleMute} className="mute-button">
            {isMuted ? 'Unmute' : 'Mute'}
          </button>
        </label>

        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={handleVolumeChange}
          className="volume-slider"
          disabled={isMuted}
        />
      </div>

      <div className="shortcut-info">
        <small>
          Tip: Use {navigator.platform.includes('Mac') ? '⌘+B' : 'Ctrl+B'} to quickly toggle to this menu
        </small>
      </div>
    </div>
  );
};

export default Popup;
