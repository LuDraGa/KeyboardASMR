import React, { useState, useEffect } from 'react';
import './Popup.css';

const Popup = () => {
  const [soundSet, setSoundSet] = useState('medium');
  const [volume, setVolume] = useState(70); // Default volume is 70%

  useEffect(() => {
    chrome.storage.sync.get(['soundSet', 'volume'], (result) => {
      if (result.soundSet) {
        setSoundSet(result.soundSet);
      }
      if (result.volume !== undefined) {
        setVolume(result.volume);
      }
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

  return (
    <div className="popup-container">
      <h3>Keyboard Sound Options</h3>

      <div className="form-group">
        <label>Select a Sound Profile:</label>
        <select value={soundSet} onChange={handleSoundSetChange} className="dropdown">
          <option value="typewriter">Typewriter</option>
          <option value="soft">Keychron Red</option>
          <option value="medium">Keychron Brown</option>
          <option value="hard">Keychron Blue</option>
          <option value="musical">Musical</option>
        </select>
      </div>

      <div className="form-group">
        <label>Sound Volume: {volume}%</label>
        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={handleVolumeChange}
          className="volume-slider"
        />
      </div>
    </div>
  );
};

export default Popup;
