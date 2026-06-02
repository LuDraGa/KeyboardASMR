export const KEY_CATEGORY_KEYS = {
  letter: '$letter',
  number: '$number',
  wasd: '$wasd',
  space: ' ',
  enter: 'Enter',
  backspace: 'Backspace',
  delete: 'Delete',
  arrow: '$arrow',
  modifier: '$modifier',
  navigation: '$navigation',
  function: '$function',
  escape: 'Escape',
  punctuation: '$punctuation',
  other: 'default',
};

const WASD_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);
const NAVIGATION_KEYS = new Set(['Tab', 'Home', 'End', 'PageUp', 'PageDown', 'Insert']);

export function getKeyPlaybackInfo({ key, code, location } = {}) {
  if (key === ' ') {
    return { playbackKey: KEY_CATEGORY_KEYS.space, keyCategory: 'space', location };
  }

  if (key === 'Enter') {
    return { playbackKey: KEY_CATEGORY_KEYS.enter, keyCategory: 'enter', location };
  }

  if (key === 'Backspace') {
    return { playbackKey: KEY_CATEGORY_KEYS.backspace, keyCategory: 'backspace', location };
  }

  if (key === 'Delete') {
    return { playbackKey: KEY_CATEGORY_KEYS.delete, keyCategory: 'delete', location };
  }

  if (key === 'Escape') {
    return { playbackKey: KEY_CATEGORY_KEYS.escape, keyCategory: 'escape', location };
  }

  if (typeof key === 'string' && key.startsWith('Arrow')) {
    return { playbackKey: key, keyCategory: 'arrow', location };
  }

  if (MODIFIER_KEYS.has(key)) {
    return { playbackKey: key, keyCategory: 'modifier', location };
  }

  if (NAVIGATION_KEYS.has(key)) {
    return { playbackKey: key, keyCategory: 'navigation', location };
  }

  if (typeof key === 'string' && /^F([1-9]|1[0-9]|2[0-4])$/.test(key)) {
    return { playbackKey: key, keyCategory: 'function', location };
  }

  if (WASD_CODES.has(code)) {
    return { playbackKey: KEY_CATEGORY_KEYS.wasd, keyCategory: 'wasd', location };
  }

  if (typeof code === 'string' && code.startsWith('Key')) {
    return { playbackKey: KEY_CATEGORY_KEYS.letter, keyCategory: 'letter', location };
  }

  if (typeof code === 'string' && (code.startsWith('Digit') || code.startsWith('Numpad'))) {
    return { playbackKey: KEY_CATEGORY_KEYS.number, keyCategory: 'number', location };
  }

  if (typeof key === 'string' && key.length === 1) {
    return { playbackKey: KEY_CATEGORY_KEYS.punctuation, keyCategory: 'punctuation', location };
  }

  return { playbackKey: KEY_CATEGORY_KEYS.other, keyCategory: 'other', location };
}

export function getPlaybackCandidates({ playbackKey, keyCategory } = {}) {
  const candidates = [];
  const addCandidate = key => {
    if (key && !candidates.includes(key)) {
      candidates.push(key);
    }
  };

  addCandidate(playbackKey);

  switch (keyCategory) {
    case 'wasd':
      addCandidate(KEY_CATEGORY_KEYS.wasd);
      addCandidate(KEY_CATEGORY_KEYS.letter);
      break;
    case 'letter':
      addCandidate(KEY_CATEGORY_KEYS.letter);
      break;
    case 'number':
      addCandidate(KEY_CATEGORY_KEYS.number);
      break;
    case 'space':
      addCandidate(KEY_CATEGORY_KEYS.space);
      break;
    case 'enter':
      addCandidate(KEY_CATEGORY_KEYS.enter);
      break;
    case 'backspace':
      addCandidate(KEY_CATEGORY_KEYS.backspace);
      break;
    case 'delete':
      addCandidate(KEY_CATEGORY_KEYS.delete);
      addCandidate(KEY_CATEGORY_KEYS.backspace);
      break;
    case 'arrow':
      addCandidate(KEY_CATEGORY_KEYS.arrow);
      addCandidate(KEY_CATEGORY_KEYS.navigation);
      break;
    case 'modifier':
      addCandidate(KEY_CATEGORY_KEYS.modifier);
      break;
    case 'navigation':
      addCandidate(KEY_CATEGORY_KEYS.navigation);
      break;
    case 'function':
      addCandidate(KEY_CATEGORY_KEYS.function);
      break;
    case 'escape':
      addCandidate(KEY_CATEGORY_KEYS.escape);
      break;
    case 'punctuation':
      addCandidate(KEY_CATEGORY_KEYS.punctuation);
      break;
    default:
      break;
  }

  addCandidate('default');
  return candidates;
}
