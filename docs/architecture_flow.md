# Keyboard ASMR Extension - Architecture Flow

## Component Communication Flow

### 1. Settings Change Flow

```
Popup UI → Background Script → All Content Scripts → Audio Update
```

**Example: User changes sound profile**
1. **Popup**: User selects new sound profile
2. **Popup**: Updates `chrome.storage.sync`
3. **Background**: Detects storage change via `chrome.storage.onChanged`
4. **Background**: Broadcasts `STATE_CHANGE` message to all tabs
5. **Content Scripts**: Receive message, update local state, reload sounds

### 2. Mute Toggle Flow

```
Popup Toggle → Background Script → All Content Scripts
```

**Steps:**
1. **Popup**: User clicks mute button
2. **Popup**: Calls `chrome.runtime.sendMessage({type: TOGGLE_MUTE})`
3. **Background**: Receives message, updates storage, broadcasts to all tabs
4. **Content Scripts**: Update `isMuted` state

### 3. Audio Playback Flow

```
Keypress → Content Script → Audio Output
              ↓
         Background Script (for icon updates)
```

**Steps:**
1. **Page**: User presses key
2. **Injected Script**: Captures keypress, sends message to content script
3. **Content Script**:
   - Plays sound directly via Web Audio API
   - Sends notification to background for icon updates
4. **Background**: Updates extension icon badge (optional)

## Key Components

### Popup (`/src/pages/Popup/`)
- **Role**: UI for settings management
- **Communicates with**: Background script only
- **Responsibilities**: Display settings, handle user input

### Background Script (`/src/pages/Background/`)
- **Role**: Lightweight coordinator & state manager
- **Communicates with**: Popup ↔ All Content Scripts
- **Responsibilities**:
  - Icon state management
  - Cross-tab state synchronization
  - Settings broadcast

### Content Script (`/src/pages/Content/`)
- **Role**: Heavy audio worker
- **Communicates with**: Background script, Injected scripts
- **Responsibilities**:
  - Audio context management
  - Sound loading & caching
  - Direct audio playback
  - Keyboard event handling

### Injected Script (`/src/pages/Content/injected.js`)
- **Role**: Keyboard capture in page context
- **Communicates with**: Content script only
- **Responsibilities**: Raw keyboard event capture

## Data Flow

```
Storage (chrome.storage.sync) ← Settings → All Components
Background Script ← State → Content Scripts
Content Scripts ← Audio → Web Audio API
```

## Why This Architecture?

- **Performance**: Audio processing happens locally in each tab
- **Reliability**: No cross-extension audio context issues
- **Chrome Compliance**: Meets autoplay policy requirements
- **Scalability**: Background script stays lightweight
- **User Experience**: Immediate audio feedback, global state sync