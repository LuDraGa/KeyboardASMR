import React, { useState, useEffect } from 'react';
import './Popup.css';
import { FaSun, FaMoon } from 'react-icons/fa'; // Import icons

const Popup = () => {
  const [soundSet, setSoundSet] = useState('medium');
  const [volume, setVolume] = useState(70); // Default volume is 70%
  const [isMuted, setIsMuted] = useState(false);
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    chrome.storage.sync.get(['soundSet', 'volume', 'isMuted', 'theme'], (result) => {
      if (result.soundSet) setSoundSet(result.soundSet);
      if (result.volume !== undefined) setVolume(result.volume);
      if (result.isMuted !== undefined) setIsMuted(result.isMuted);
      if (result.theme) setTheme(result.theme);
    });
  }, []);

  const handleSoundSetChange = (event) => {
    const newSoundSet = event.target.value;
    setSoundSet(newSoundSet);
    chrome.storage.sync.set({ soundSet: newSoundSet });
  };

  const handleVolumeChange = (event) => {
    const newVolume = event.target.value;
    setVolume(newVolume);
    chrome.storage.sync.set({ volume: newVolume });
  };

  const toggleMute = () => {
    const muteState = !isMuted;
    setIsMuted(muteState);
    chrome.storage.sync.set({ isMuted: muteState });
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    chrome.storage.sync.set({ theme: newTheme });
  };

  return (
    <div className={`popup-container ${theme}`}>
      <div className="header">
        <h3>Keyboard Sound Options &nbsp;
          <button onClick={toggleTheme} className="theme-toggle-button">
            {theme === 'dark' ? <FaSun /> : <FaMoon />}
          </button>
        </h3>

      </div>

      <div className="form-group">
        <label>Select a Sound Profile:</label>
        <select value={soundSet} onChange={handleSoundSetChange} className="dropdown">
          <option value="typewriter">Typewriter</option>
          <option value="soft">Keychron Red</option>
          <option value="medium">Keychron Brown</option>
          <option value="hard">Keychron Blue</option>
        </select>
      </div>

      <div className="form-group">
        <label>Sound Volume: {volume}% <button onClick={toggleMute} className="mute-button">
          {isMuted ? 'Unmute' : 'Mute'}
        </button></label>

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



    </div>
  );
};

export default Popup;
