# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build & Development

- **Build extension**: `npm run build` - Creates production build in `/build` directory
- **Development server**: `npm run start` - Runs webpack dev server for hot reload during development
- **Format code**: `npm run prettier` - Formats all JS/JSX/TS/TSX/JSON/CSS/SCSS/MD files
- **Lint code**: `npm run lint` - Runs ESLint to check for code issues
- **Lint and fix**: `npm run lint:fix` - Runs ESLint and automatically fixes fixable issues

### Environment Setup

- Node version: 18.20.3 (specified in `.nvmrc`)
- Install dependencies: `npm install`

### Testing

- No test framework is currently configured in this project
- All test files found are from node_modules dependencies only

## Architecture Overview

This is a Chrome Extension (Manifest V3) that plays keyboard sounds when users type. The architecture has evolved to handle Web Audio API restrictions and cross-origin limitations.

### Core Components

1. **Content Script** (`src/pages/Content/index.js`):

   - Handles ALL audio playback directly using Web Audio API
   - Loads and caches sound buffers for all sound sets
   - Injects a script into the page context to capture keyboard events
   - Listens for messages from the injected script via postMessage
   - Falls back to direct event listening for sites where injection fails

2. **Injected Script** (`src/pages/Content/injected.js`):

   - Runs in the page's JavaScript context (not extension context)
   - Captures raw keyboard events before any page scripts can prevent them
   - Communicates with content script via window.postMessage
   - Uses debouncing (30ms) to prevent duplicate sounds

3. **Background Service Worker** (`src/pages/Background/index.js`):

   - Manages extension state and icon updates
   - Broadcasts mute state changes to all tabs and frames
   - No longer handles audio playback (moved to content script for better performance)

4. **Popup UI** (`src/pages/Popup/Popup.jsx`):
   - React-based settings interface
   - Sound profile selection with preview functionality
   - Volume control and mute toggle
   - Theme switching (dark/light mode)

### Key Architectural Decisions

1. **Audio moved from Background to Content Script**: The extension previously used an offscreen document for audio, but now handles all audio directly in content scripts for better performance and reliability.

2. **Dual-layer keyboard capture**: Uses both an injected script (for maximum compatibility) and direct event listeners (as fallback) to ensure keyboard events are captured across different websites.

3. **All frames injection**: Content scripts inject into all frames (`all_frames: true`) to support sites with iframes like online notepads.

4. **Shared configuration**: All sound sets, message types, and settings are centralized in `src/shared/config.js`.

### Sound System

Sound sets are defined in `src/shared/config.js`:

- `typewriter`: Different sounds for Enter and Backspace keys
- `soft/medium/hard`: Keyboard switch simulations (Red/Brown/Blue)
- `drum`: Different drum sounds for different keys (space, enter, backspace)

Each sound set can have:

- `default`: Sound for most keys
- Key-specific sounds (e.g., `Enter`, `Backspace`, ` ` for space)

Audio files are located in `src/assets/sounds/` with subdirectories for each sound type (typewriter, keyboard, drum).

### Build System

Uses Webpack 5 with:

- Multiple entry points for different extension components
- CopyWebpackPlugin to handle manifest.json and static assets
- Automatic version injection from package.json
- React Refresh for development hot reload
- Asset copying for sounds and icons

### Known Limitations

- Chrome Web Store pages block content scripts
- Some sites may prevent keyboard event capture
- Web Audio API requires user interaction for initialization (handled on first keypress)
