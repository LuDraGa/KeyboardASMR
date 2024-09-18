import React, { useState, useEffect } from 'react';
import logo from '../../assets/img/logo.svg';
import Greetings from '../../containers/Greetings/Greetings';
import './Popup.css';

const Popup = () => {
  const [soundSet, setSoundSet] = useState('typewriter');

  useEffect(() => {
    chrome.storage.sync.get(['soundSet'], (result) => {
      if (result.soundSet) {
        setSoundSet(result.soundSet);
      }
    });
  }, []);

  const handleChange = (event) => {
    const selectedSoundSet = event.target.value;
    setSoundSet(selectedSoundSet);
    chrome.storage.sync.set({ soundSet: selectedSoundSet });
    console.log("selectedSoundSet")
    console.log(selectedSoundSet)
  };

  return (
    <div className="App">
      <h3>Keyboard Sound Extension Options</h3>
      <label>
        Select Sound Set:
        <select value={soundSet} onChange={handleChange}>
          <option value="typewriter">Typewriter</option>
          <option value="soft">Keychron Red</option>
          <option value="medium">Keychron Brown</option>
          <option value="hard">Keychron Blue</option>
        </select>
      </label>
    </div>
  );
};

export default Popup;
