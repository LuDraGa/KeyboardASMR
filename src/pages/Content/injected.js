// This script is injected directly into the page context
// It captures keyboard events at the window level for maximum compatibility
(function () {
  'use strict';

  // Unique identifier for our messages
  const MESSAGE_SOURCE = 'keyboard-asmr-injected';

  // Debounce configuration
  const DEBOUNCE_DELAY = 30; // milliseconds
  let lastKeyTime = 0;

  // Check if we should capture events from this element
  function shouldCaptureFromElement(element) {
    // Capture from all input elements and contenteditable
    if (!element) return true;

    const tagName = element.tagName?.toLowerCase();
    const isEditable = element.contentEditable === 'true' || element.isContentEditable;
    const isInput = ['input', 'textarea', 'select'].includes(tagName);

    return isEditable || isInput || !element.tagName;
  }

  // Enhanced keyboard event handler
  function handleKeyboardEvent(event) {
    // Don't capture if modifier keys are pressed (except shift for capitals)
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    // Debounce rapid keypresses
    const currentTime = Date.now();
    if (currentTime - lastKeyTime < DEBOUNCE_DELAY && event.key === lastKey) {
      return;
    }
    lastKeyTime = currentTime;

    // Check if we should capture from this element
    if (!shouldCaptureFromElement(event.target)) {
      return;
    }

    // Send message to content script
    window.postMessage(
      {
        source: MESSAGE_SOURCE,
        type: 'KEYPRESS',
        data: {
          key: event.key,
          code: event.code,
          timestamp: currentTime,
          isComposing: event.isComposing || false,
          location: event.location,
          repeat: event.repeat,
          targetInfo: {
            tagName: event.target.tagName?.toLowerCase(),
            isContentEditable: event.target.isContentEditable,
            type: event.target.type,
          },
        },
      },
      '*'
    );
  }

  let lastKey = '';

  // Attach event listeners with capture phase for maximum coverage
  window.addEventListener('keydown', handleKeyboardEvent, true);

  // Also attach to document for redundancy
  document.addEventListener('keydown', handleKeyboardEvent, true);

  // Handle dynamically added iframes
  function attachToIframes() {
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach((iframe) => {
      try {
        // Only works for same-origin iframes
        if (iframe.contentWindow) {
          iframe.contentWindow.addEventListener('keydown', handleKeyboardEvent, true);
        }
      } catch (e) {
        // Cross-origin iframe, skip
      }
    });
  }

  // Monitor for new iframes
  const observer = new MutationObserver((mutations) => {
    let hasNewIframes = false;
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.tagName === 'IFRAME') {
          hasNewIframes = true;
        }
      });
    });
    if (hasNewIframes) {
      setTimeout(attachToIframes, 100);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Initial iframe attachment
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachToIframes);
  } else {
    attachToIframes();
  }

  // Handle special cases for popular web apps
  function enhanceCompatibility() {
    // Google Docs uses custom event handling
    if (window.location.hostname.includes('docs.google.com')) {
      const docsEditor = document.querySelector('.kix-appview-editor');
      if (docsEditor) {
        docsEditor.addEventListener('keydown', handleKeyboardEvent, true);
      }
    }

    // CodeMirror editors
    if (window.CodeMirror) {
      const editors = document.querySelectorAll('.CodeMirror');
      editors.forEach((editor) => {
        if (editor.CodeMirror) {
          editor.CodeMirror.on('keydown', (cm, event) => {
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
          monacoEditors.forEach((editor) => {
            editor.addEventListener('keydown', handleKeyboardEvent, true);
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

  console.log('Keyboard ASMR: Injected script loaded successfully');
})();
