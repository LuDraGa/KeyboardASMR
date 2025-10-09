# Keyboard Event Types Feature - Planning Document

## Overview
Add support for playing different sounds based on keyboard event types: keydown (initial press), keyup (release), and keypress (auto-repeat when held).

## Problem Statement
Currently, the extension only plays sounds on keydown events, including auto-repeats. Users want:
1. Different sounds for initial press vs holding vs release
2. Ability to disable specific event sounds for certain keys
3. Fine-grained control per key while using sensible defaults

## Current Behavior Analysis

### Event Flow
1. **injected.js** listens to `keydown` events only (line 71, 74)
2. Captures `event.repeat` flag but doesn't use it
3. Sends all keydown events via postMessage (including repeats)
4. **index.js** plays sound on every keydown, regardless of repeat flag

### What Happens When Holding a Key
Browser fires: `keydown (repeat=false)` → `keydown (repeat=true)` → `keydown (repeat=true)` → ... → `keyup`

Current code:
- Captures all keydown events (initial + repeats)
- Plays same sound for ALL keydown events
- Never captures keyup

Result: Sound plays repeatedly while holding, but it's the same sound each time.

## Solution Design

### Event Type Mapping
| Browser Event | Condition | Our Event Type |
|--------------|-----------|----------------|
| keydown | repeat = false | "keydown" |
| keydown | repeat = true | "keypress" |
| keyup | - | "keyup" |

### YAML Schema

```yaml
name: "Example Profile"
author: "Author Name"
description: "Profile description"
version: "1.0"

ui:
  icon: "⌨️"
  color: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
  category: "mechanical"

audio_sources:
  key_down: { type: "bundled", path: "sounds/key-down.wav" }
  key_up: { type: "bundled", path: "sounds/key-up.wav" }
  key_repeat: { type: "bundled", path: "sounds/key-repeat.wav" }
  enter_down: { type: "bundled", path: "sounds/enter.wav" }
  space_down: { type: "bundled", path: "sounds/space.wav" }

key_mappings:
  # Default for all keys - all three event types
  default:
    keydown: "key_down"
    keyup: "key_up"
    keypress: "key_repeat"

  # Enter key - only keydown, no keyup/keypress
  "Enter":
    keydown: "enter_down"
    keyup: None      # Explicitly disabled
    keypress: None   # Explicitly disabled

  # Space - custom keydown, inherit default for others
  " ":
    keydown: "space_down"
    # keyup not defined → falls back to default.keyup
    # keypress not defined → falls back to default.keypress

  # Backspace - only keydown, inherit default keyup, no keypress
  "Backspace":
    keydown: "key_down"
    keypress: None
    # keyup not defined → falls back to default.keyup
```

### Fallback Logic

For a given key and event type:

```
1. Check if key has specific mapping (e.g., "Enter")
   a. If event type is defined:
      - If value is "None" (string) → no sound
      - If value is audio source ID → use that sound
   b. If event type is NOT defined → go to step 2

2. Check default mapping
   a. If event type is defined:
      - If value is "None" → no sound
      - If value is audio source ID → use that sound
   b. If event type is NOT defined → no sound

3. No sound
```

### Examples

**Profile has:**
```yaml
default:
  keydown: "key_down"
  keyup: "key_up"
  keypress: "key_repeat"

"Enter":
  keydown: "enter_down"
  keyup: None

"Space":
  keydown: "space_down"
```

**When user presses and holds Enter:**
1. Initial press: plays "enter_down" (Enter.keydown defined)
2. Auto-repeat: no sound (Enter.keypress undefined, default.keypress would be used but Enter.keypress is not defined, so checks default)
   - Actually, Enter.keypress is not defined, so it falls back to default.keypress = "key_repeat"
3. Release: no sound (Enter.keyup = None)

Wait, I need to clarify the fallback logic better:

**Corrected Fallback Logic:**

```python
def get_sound(key, event_type):
    # Step 1: Check specific key mapping
    if key in key_mappings:
        key_config = key_mappings[key]

        # If it's a string (old format), treat as keydown-only
        if isinstance(key_config, str):
            if event_type == "keydown":
                return key_config
            else:
                # Fall through to default
                pass
        # If it's an object (new format)
        elif isinstance(key_config, dict):
            if event_type in key_config:
                sound = key_config[event_type]
                if sound == "None" or sound is None:
                    return None  # Explicitly disabled
                else:
                    return sound  # Use specific sound
            # else: event_type not defined for this key, fall through to default

    # Step 2: Check default mapping
    default_config = key_mappings.get("default")
    if default_config:
        if isinstance(default_config, str):
            if event_type == "keydown":
                return default_config
            else:
                return None
        elif isinstance(default_config, dict):
            if event_type in default_config:
                sound = default_config[event_type]
                if sound == "None" or sound is None:
                    return None
                else:
                    return sound

    # Step 3: No sound found
    return None
```

### Internal Data Structure

After profile loading, soundBuffers should look like:

```javascript
soundBuffers = {
  "typewriter": {
    "default": {
      "keydown": AudioBuffer,
      "keyup": AudioBuffer,
      "keypress": AudioBuffer
    },
    "Enter": {
      "keydown": AudioBuffer,
      "keyup": null,  // Explicitly disabled
      "keypress": null  // Explicitly disabled
    },
    " ": {
      "keydown": AudioBuffer
      // keyup and keypress will fall back to default at runtime
    }
  }
}
```

Note: We only store explicitly defined or explicitly disabled (None) values. Missing values mean "use default".

## Implementation Details

### 1. src/pages/Content/injected.js

**Current:**
```javascript
window.addEventListener('keydown', handleKeyboardEvent, true);
```

**New:**
```javascript
window.addEventListener('keydown', handleKeyboardEvent, true);
window.addEventListener('keyup', handleKeyboardEvent, true);

function handleKeyboardEvent(event) {
  // ... existing validation ...

  // Determine event type
  let eventType;
  if (event.type === 'keyup') {
    eventType = 'keyup';
  } else if (event.type === 'keydown') {
    eventType = event.repeat ? 'keypress' : 'keydown';
  }

  // Update debouncing to be per (key, eventType) pair
  const debounceKey = `${event.key}_${eventType}`;
  // ... debounce logic ...

  window.postMessage({
    source: MESSAGE_SOURCE,
    type: 'KEYPRESS',  // Keep same for compatibility
    data: {
      key: event.key,
      code: event.code,
      eventType: eventType,  // NEW
      timestamp: currentTime,
      // ... rest of data ...
    }
  }, '*');
}
```

**Changes:**
- Add keyup listener on all locations (window, document, iframes, special editors)
- Determine eventType based on event.type and event.repeat
- Pass eventType in postMessage data
- Update debouncing to track per (key, eventType) pair

### 2. src/pages/Content/index.js

**Current:**
```javascript
async function playSound(key) {
  if (isMuted || !isAudioInitialized) return;
  await ensureAudioContextResumed();

  const buffer = soundBuffers[currentSoundSet]?.[key] ||
                 soundBuffers[currentSoundSet]?.default;
  // ... play buffer ...
}
```

**New:**
```javascript
async function playSound(key, eventType) {
  if (isMuted || !isAudioInitialized) return;
  await ensureAudioContextResumed();

  // Try specific key + event type
  let buffer = soundBuffers[currentSoundSet]?.[key]?.[eventType];

  // If undefined (not explicitly set), fall back to default
  if (buffer === undefined) {
    buffer = soundBuffers[currentSoundSet]?.default?.[eventType];
  }

  // If null (explicitly disabled) or still undefined, return
  if (!buffer) return;

  // ... play buffer ...
}

// Update message listener
window.addEventListener('message', async event => {
  if (event.data?.source === 'keyboard-asmr-injected' &&
      event.data?.type === 'KEYPRESS') {
    if (!isAudioInitialized) {
      await initAudio();
    }

    if (!isMuted) {
      const { key, eventType } = event.data.data;
      await playSound(key, eventType || 'keydown');  // Default to keydown for backward compat
    }
    // ... rest ...
  }
});

// Update fallback listener
document.addEventListener('keydown', async event => {
  // ...
  const eventType = event.repeat ? 'keypress' : 'keydown';
  await playSound(event.key, eventType);
  // ...
});

// Add fallback keyup listener
document.addEventListener('keyup', async event => {
  if (isMuted) return;
  if (!isAudioInitialized) {
    await initAudio();
  }
  await playSound(event.key, 'keyup');
  // ...
});
```

**Changes:**
- Add eventType parameter to playSound()
- Implement fallback logic: key[eventType] → default[eventType] → no sound
- null means explicitly disabled (don't play)
- undefined means not defined (try default)
- Update message listener to extract eventType
- Update fallback listeners to handle keyup and determine eventType

### 3. src/utils/profileLoader.js

**Update validateKeyMappings:**
```javascript
validateKeyMappings(keyMappings, audioSources) {
  for (const [key, mapping] of Object.entries(keyMappings)) {
    if (typeof mapping === 'string') {
      // Old format - just validate the audio source exists
      if (!audioSources[mapping]) {
        throw new Error(`Key mapping "${key}" references unknown audio source: ${mapping}`);
      }
    } else if (typeof mapping === 'object') {
      // New format - validate each event type
      for (const [eventType, sourceId] of Object.entries(mapping)) {
        if (!['keydown', 'keyup', 'keypress'].includes(eventType)) {
          throw new Error(`Invalid event type "${eventType}" in mapping for key "${key}"`);
        }

        // Skip validation for None
        if (sourceId === 'None' || sourceId === null) {
          continue;
        }

        if (!audioSources[sourceId]) {
          throw new Error(
            `Key mapping "${key}.${eventType}" references unknown audio source: ${sourceId}`
          );
        }
      }
    } else {
      throw new Error(`Invalid mapping format for key "${key}"`);
    }
  }

  // Ensure default exists
  if (!keyMappings.default) {
    throw new Error('Profile must define a "default" key mapping');
  }
}
```

**Update profileToLegacyFormat:**
```javascript
async profileToLegacyFormat(profile) {
  const legacyFormat = {};

  for (const [key, mapping] of Object.entries(profile.key_mappings)) {
    if (typeof mapping === 'string') {
      // Old format - convert to new nested structure with keydown only
      const sourceConfig = profile.audio_sources[mapping];
      const audioUrl = await this.resolveAudioUrl(sourceConfig);
      const relativePath = this.urlToRelativePath(audioUrl);

      legacyFormat[key] = {
        keydown: relativePath,
        keyup: null,
        keypress: null
      };
    } else if (typeof mapping === 'object') {
      // New format - convert each event type
      legacyFormat[key] = {};

      for (const [eventType, sourceId] of Object.entries(mapping)) {
        if (sourceId === 'None' || sourceId === null) {
          legacyFormat[key][eventType] = null;
        } else {
          const sourceConfig = profile.audio_sources[sourceId];
          const audioUrl = await this.resolveAudioUrl(sourceConfig);
          legacyFormat[key][eventType] = this.urlToRelativePath(audioUrl);
        }
      }
    }
  }

  return legacyFormat;
}

urlToRelativePath(audioUrl) {
  if (audioUrl.startsWith('chrome-extension://')) {
    const url = new URL(audioUrl);
    return url.pathname.replace('/', '');
  }
  return audioUrl;
}
```

**Update loadSounds in index.js:**
```javascript
async function loadSounds() {
  const loadSound = async url => {
    try {
      const response = await fetch(chrome.runtime.getURL(url));
      const arrayBuffer = await response.arrayBuffer();
      return await audioContext.decodeAudioData(arrayBuffer);
    } catch (error) {
      console.error(`Keyboard ASMR: Error loading sound: ${url}`, error);
      return null;
    }
  };

  try {
    const SOUND_SETS = await getSoundSets();

    // Load all sounds from configuration
    for (const [setName, keyMappings] of Object.entries(SOUND_SETS)) {
      soundBuffers[setName] = {};

      for (const [key, eventMappings] of Object.entries(keyMappings)) {
        if (typeof eventMappings === 'string') {
          // Old format - single sound for keydown
          soundBuffers[setName][key] = {
            keydown: await loadSound(eventMappings),
            keyup: null,
            keypress: null
          };
        } else if (typeof eventMappings === 'object') {
          // New format - per-event sounds
          soundBuffers[setName][key] = {};

          for (const [eventType, path] of Object.entries(eventMappings)) {
            if (path === null) {
              soundBuffers[setName][key][eventType] = null;
            } else {
              soundBuffers[setName][key][eventType] = await loadSound(path);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Keyboard ASMR: Failed to load sound sets:', error);
  }
}
```

### 4. Update Sample Profiles

**typewriter.yaml** - Add keyup and keypress sounds:
```yaml
audio_sources:
  key_press_down:
    type: "bundled"
    path: "typewriter/key-press.wav"
  key_press_up:
    type: "bundled"
    path: "typewriter/key-press.wav"  # Can use same sound or different
  key_press_repeat:
    type: "bundled"
    path: "typewriter/key-press.wav"
  enter_key_down:
    type: "bundled"
    path: "typewriter/enter-key.wav"
  backspace_key_down:
    type: "bundled"
    path: "typewriter/backspace-tyr.wav"

key_mappings:
  default:
    keydown: "key_press_down"
    keyup: "key_press_up"
    keypress: "key_press_repeat"
  "Enter":
    keydown: "enter_key_down"
    keyup: None
    keypress: None
  "Backspace":
    keydown: "backspace_key_down"
    keyup: None
    keypress: None
```

**drum.yaml** - Showcase event types:
```yaml
audio_sources:
  snare_hit:
    type: "bundled"
    path: "drum/snare1.wav"
  snare_ghost:
    type: "bundled"
    path: "drum/openSnare1.wav"
  kick_hit:
    type: "bundled"
    path: "drum/kick1.wav"
  tom_hit:
    type: "bundled"
    path: "drum/tom1.wav"

key_mappings:
  default:
    keydown: "snare_hit"
    keyup: None  # Drums don't have release sounds
    keypress: "snare_ghost"  # Ghost notes when holding
  "Enter":
    keydown: "kick_hit"
    keyup: None
    keypress: None  # No kick repeats
  " ":
    keydown: "tom_hit"
    keyup: None
    keypress: None
  "Backspace":
    keydown: "snare_ghost"
    keyup: None
    keypress: None
```

## Migration Strategy

No backward compatibility needed - users will get the new app. However:
1. Profiles with old format (string values) will still work
2. They'll be auto-converted to new format with keydown-only sounds
3. Can gradually update profiles to use new features

## Testing Checklist

### Basic Functionality
- [ ] Keydown on first press plays keydown sound
- [ ] Holding key plays keypress sounds (if defined)
- [ ] Releasing key plays keyup sound (if defined)
- [ ] Keys without keypress defined don't play sound on repeat

### Fallback Logic
- [ ] Key with partial mapping falls back to default
- [ ] Explicit None disables sound for that event type
- [ ] Missing event type in both key and default = no sound
- [ ] Default event types work for unmapped keys

### Edge Cases
- [ ] Modifier keys (Ctrl, Alt, Shift) work correctly
- [ ] Special keys (Enter, Backspace, Space) work
- [ ] Volume control affects all event types
- [ ] Mute works for all event types
- [ ] Profile switching reloads all event type sounds

### Performance
- [ ] Debouncing works per (key, eventType)
- [ ] No memory leaks from event listeners
- [ ] Holding multiple keys simultaneously works

### Compatibility
- [ ] Old format profiles still work (keydown only)
- [ ] Mixed old/new format in same profile works
- [ ] All existing sound profiles still function

## Implementation Order

1. ✅ Create this planning document
2. Update profileLoader.js - schema validation
3. Update loadSounds in index.js - handle new structure
4. Update playSound in index.js - add eventType parameter and fallback logic
5. Update injected.js - add keyup listeners and eventType determination
6. Update index.js message handlers - extract and pass eventType
7. Update typewriter.yaml - showcase feature
8. Update drum.yaml - showcase feature
9. Build and test thoroughly

## Status
- [x] Planning document created
- [ ] Core implementation
- [ ] Profile updates
- [ ] Testing and validation

## Notes
- Consider adding UI toggle in popup to enable/disable specific event types globally
- May want volume control per event type in the future
- Could add per-key debounce configuration in profiles
- Consider adding sound randomization (pick from array) for variety
