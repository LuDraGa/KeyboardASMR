import { getKeyPlaybackInfo } from '../../shared/keyCategories';

// This script is injected directly into the page context
// It captures keyboard events at the window level for maximum compatibility
(function () {
  'use strict';

  // Unique identifier for our messages
  const MESSAGE_SOURCE = 'keyboard-asmr-injected';

  // Debounce configuration
  const DEBOUNCE_DELAY = 30; // milliseconds
  const lastEventTimes = new Map(); // Track per (key, eventType) for debouncing
  const activeCompatibilityModes = new Set();
  let compatibilityStatusTimer = null;

  const COMPATIBILITY_RULES = [
    {
      mode: 'google_docs',
      hosts: ['docs.google.com'],
      selectors: ['.kix-appview-editor', '.docs-texteventtarget-iframe'],
      allowDocumentWhenPresent: true,
    },
    {
      mode: 'chatgpt',
      hosts: ['chatgpt.com', 'chat.openai.com'],
      selectors: [
        '#prompt-textarea',
        '[contenteditable="true"][data-testid*="prompt"]',
        'textarea',
      ],
    },
    {
      mode: 'notion',
      hosts: ['notion.so', 'www.notion.so'],
      selectors: ['[contenteditable="true"]', '.notion-page-content'],
    },
    {
      mode: 'slack',
      hostIncludes: ['slack.com'],
      selectors: ['[data-qa="message_input"]', '[contenteditable="true"][role="textbox"]'],
    },
    {
      mode: 'discord',
      hosts: ['discord.com', 'ptb.discord.com', 'canary.discord.com'],
      selectors: ['[role="textbox"][contenteditable="true"]', '[data-slate-editor="true"]'],
    },
    {
      mode: 'code_editor',
      selectors: [
        '.CodeMirror',
        '.cm-editor',
        '.monaco-editor',
        '.ace_editor',
        'textarea.inputarea',
      ],
    },
  ];

  function publishCompatibilityStatus() {
    if (compatibilityStatusTimer) {
      clearTimeout(compatibilityStatusTimer);
    }

    compatibilityStatusTimer = setTimeout(() => {
      window.postMessage(
        {
          source: MESSAGE_SOURCE,
          type: 'COMPATIBILITY_STATUS',
          data: {
            modes: Array.from(activeCompatibilityModes).sort(),
          },
        },
        '*'
      );
    }, 50);
  }

  function hostnameMatches(rule) {
    const hostname = window.location.hostname;

    if (rule.hosts?.includes(hostname)) {
      return true;
    }

    return rule.hostIncludes?.some(hostPart => hostname.includes(hostPart)) || false;
  }

  function matchesSelector(element, selector) {
    if (!element || element === window || element === document || !element.matches) {
      return false;
    }

    try {
      return element.matches(selector) || Boolean(element.closest?.(selector));
    } catch (error) {
      return false;
    }
  }

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
  function getCompatibilityTarget(event) {
    const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : [];

    for (const rule of COMPATIBILITY_RULES) {
      if ((rule.hosts || rule.hostIncludes) && !hostnameMatches(rule)) {
        continue;
      }

      const matchedPathTarget = eventPath.find(element =>
        rule.selectors.some(selector => matchesSelector(element, selector))
      );

      if (matchedPathTarget) {
        activeCompatibilityModes.add(rule.mode);
        publishCompatibilityStatus();
        return {
          target: matchedPathTarget,
          mode: rule.mode,
        };
      }

      if (rule.allowDocumentWhenPresent) {
        const existingTarget = rule.selectors
          .map(selector => document.querySelector(selector))
          .find(Boolean);

        if (existingTarget) {
          activeCompatibilityModes.add(rule.mode);
          publishCompatibilityStatus();
          return {
            target: existingTarget,
            mode: rule.mode,
          };
        }
      }
    }

    return null;
  }

  function getCaptureContext(event) {
    if (isTypingElement(event.target)) {
      return { target: event.target, mode: null };
    }

    const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const typingTarget = eventPath.find(isTypingElement);

    if (typingTarget) {
      return { target: typingTarget, mode: null };
    }

    const compatibilityTarget = getCompatibilityTarget(event);
    if (compatibilityTarget) {
      return compatibilityTarget;
    }

    return event.target?.tagName ? null : { target: event.target, mode: null };
  }

  // Enhanced keyboard event handler
  function handleKeyboardEvent(event) {
    // Don't capture if modifier keys are pressed (except shift for capitals)
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    // Check if we should capture from this element
    const captureContext = getCaptureContext(event);
    if (!captureContext?.target) {
      return;
    }
    const captureTarget = captureContext.target;
    const playbackInfo = getKeyPlaybackInfo(event);

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
    const debounceKey = `${playbackInfo.playbackKey}_${eventType}`;
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
          playbackKey: playbackInfo.playbackKey,
          keyCategory: playbackInfo.keyCategory,
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
            compatibilityMode: captureContext.mode,
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
        activeCompatibilityModes.add('google_docs');
        docsEditor.addEventListener('keydown', handleKeyboardEvent, true);
        docsEditor.addEventListener('keyup', handleKeyboardEvent, true);
      }
    }

    // CodeMirror editors
    if (window.CodeMirror) {
      const editors = document.querySelectorAll('.CodeMirror');
      editors.forEach(editor => {
        if (editor.CodeMirror) {
          activeCompatibilityModes.add('code_editor');
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
          activeCompatibilityModes.add('code_editor');
          monacoEditors.forEach(editor => {
            editor.addEventListener('keydown', handleKeyboardEvent, true);
            editor.addEventListener('keyup', handleKeyboardEvent, true);
          });
          publishCompatibilityStatus();
        }
      }, 1000);
    }

    if (activeCompatibilityModes.size > 0) {
      publishCompatibilityStatus();
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
      data: {
        modes: Array.from(activeCompatibilityModes).sort(),
      },
    },
    '*'
  );

  console.log('Keyboard ASMR: Injected script loaded successfully');
})();
