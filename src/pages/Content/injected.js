// This script is injected directly into the page context
// It captures keyboard events at the window level for maximum compatibility
(function () {
  'use strict';

  // Unique identifier for our messages
  const MESSAGE_SOURCE = 'keyboard-asmr-injected';

  // Debounce configuration
  const DEBOUNCE_DELAY = 30; // milliseconds
  const lastEventTimes = new Map(); // Track per (key, eventType) for debouncing

  function isTypingElement(element) {
    if (!element || element === window || element === document) {
      return false;
    }

    const tagName = element.tagName?.toLowerCase();
    const isEditable = element.contentEditable === 'true' || element.isContentEditable;
    const isInput = ['input', 'textarea', 'select'].includes(tagName);

    return isEditable || isInput;
  }

  // Keyboard events from Shadow DOM are retargeted to the host. Use the
  // composed path so shadow inputs/editors are still treated as typing surfaces.
  function getCaptureTarget(event) {
    if (isTypingElement(event.target)) {
      return event.target;
    }

    const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const typingTarget = eventPath.find(isTypingElement);

    if (typingTarget) {
      return typingTarget;
    }

    return event.target?.tagName ? null : event.target;
  }

  // Enhanced keyboard event handler
  function handleKeyboardEvent(event) {
    // Don't capture if modifier keys are pressed (except shift for capitals)
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    // Check if we should capture from this element
    const captureTarget = getCaptureTarget(event);
    if (!captureTarget) {
      return;
    }

    // Determine event type
    let eventType;
    if (event.type === 'keyup') {
      eventType = 'keyup';
    } else if (event.type === 'keydown') {
      eventType = event.repeat ? 'keypress' : 'keydown';
    } else {
      return; // Unknown event type
    }

    // Debounce per (key, eventType) pair
    const currentTime = Date.now();
    const debounceKey = `${event.key}_${eventType}`;
    const lastTime = lastEventTimes.get(debounceKey) || 0;

    if (currentTime - lastTime < DEBOUNCE_DELAY) {
      return;
    }
    lastEventTimes.set(debounceKey, currentTime);

    // Send message to content script
    window.postMessage(
      {
        source: MESSAGE_SOURCE,
        type: 'KEYPRESS',
        data: {
          key: event.key,
          code: event.code,
          eventType: eventType,
          timestamp: currentTime,
          isComposing: event.isComposing || false,
          location: event.location,
          repeat: event.repeat,
          targetInfo: {
            tagName: captureTarget.tagName?.toLowerCase(),
            isContentEditable: captureTarget.isContentEditable,
            type: captureTarget.type,
            wasRetargeted: captureTarget !== event.target,
          },
        },
      },
      '*'
    );
  }

  // Attach event listeners with capture phase for maximum coverage
  window.addEventListener('keydown', handleKeyboardEvent, true);
  window.addEventListener('keyup', handleKeyboardEvent, true);

  // Also attach to document for redundancy
  document.addEventListener('keydown', handleKeyboardEvent, true);
  document.addEventListener('keyup', handleKeyboardEvent, true);

  // Handle special cases for popular web apps
  function enhanceCompatibility() {
    // Google Docs uses custom event handling
    if (window.location.hostname.includes('docs.google.com')) {
      const docsEditor = document.querySelector('.kix-appview-editor');
      if (docsEditor) {
        docsEditor.addEventListener('keydown', handleKeyboardEvent, true);
        docsEditor.addEventListener('keyup', handleKeyboardEvent, true);
      }
    }

    // CodeMirror editors
    if (window.CodeMirror) {
      const editors = document.querySelectorAll('.CodeMirror');
      editors.forEach(editor => {
        if (editor.CodeMirror) {
          editor.CodeMirror.on('keydown', (cm, event) => {
            handleKeyboardEvent(event);
          });
          editor.CodeMirror.on('keyup', (cm, event) => {
            handleKeyboardEvent(event);
          });
        }
      });
    }

    // Monaco Editor (VS Code web)
    if (window.monaco) {
      // Monaco editors need special handling
      const checkMonacoEditors = setInterval(() => {
        const monacoEditors = document.querySelectorAll('.monaco-editor');
        if (monacoEditors.length > 0) {
          clearInterval(checkMonacoEditors);
          monacoEditors.forEach(editor => {
            editor.addEventListener('keydown', handleKeyboardEvent, true);
            editor.addEventListener('keyup', handleKeyboardEvent, true);
          });
        }
      }, 1000);
    }
  }

  // Run compatibility enhancements
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceCompatibility);
  } else {
    setTimeout(enhanceCompatibility, 100);
  }

  // Send ready signal to content script to disable fallback listeners
  window.postMessage(
    {
      source: MESSAGE_SOURCE,
      type: 'INJECTED_READY',
    },
    '*'
  );

  console.log('Keyboard ASMR: Injected script loaded successfully');
})();
