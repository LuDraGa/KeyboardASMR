import React, { useCallback, useEffect, useRef, useState } from 'react';
import './Popup.css';
import {
  DEFAULT_SETTINGS,
  MESSAGE_TYPES,
  STORAGE_KEYS,
  isDiagnosticUploadConfigured,
  resolveSoundSetId,
} from '../../shared/config';
import { profileLoader } from '../../utils/profileLoader';

const VOLUME_WRITE_DELAY = 250;

const createDisconnectedStatus = (reason, context = {}) => ({
  state: 'disconnected',
  title: 'Disconnected',
  message: 'Content script status is unavailable.',
  reason,
  context,
  report: null,
});

const getTabContext = tab => {
  const context = {
    activeTabPresent: Boolean(tab),
    tabIdPresent: Boolean(tab?.id),
    loadStatus: tab?.status || 'unknown',
    urlAvailable: false,
    urlScheme: 'unavailable',
    pageType: 'unknown',
  };

  const tabUrl = tab?.url || tab?.pendingUrl;
  if (!tabUrl) {
    return context;
  }

  try {
    const parsedUrl = new URL(tabUrl);
    const scheme = parsedUrl.protocol.replace(':', '');

    context.urlAvailable = true;
    context.urlScheme = scheme;

    if (['chrome', 'edge', 'about', 'devtools'].includes(scheme)) {
      context.pageType = 'browser_internal';
    } else if (scheme === 'chrome-extension') {
      context.pageType = 'extension_page';
    } else if (scheme === 'file') {
      context.pageType = 'local_file';
    } else if (
      parsedUrl.hostname === 'chromewebstore.google.com' ||
      parsedUrl.hostname === 'chrome.google.com'
    ) {
      context.pageType = 'chrome_web_store';
    } else if (scheme === 'http' || scheme === 'https') {
      context.pageType = 'regular_web';
    } else {
      context.pageType = 'other';
    }
  } catch (error) {
    context.urlAvailable = true;
    context.urlScheme = 'parse_failed';
    context.pageType = 'unknown';
  }

  return context;
};

const getStatusFromReport = report => {
  if (report.muted) {
    return {
      state: 'muted',
      title: 'Muted',
      message: 'Turn sound on to test playback.',
      report,
    };
  }

  if (!report.audioInitialized) {
    return {
      state: 'checking',
      title: 'Audio loading',
      message: 'Press a key or check again in a moment.',
      report,
    };
  }

  if (!report.selectedProfileLoaded && !report.activeProfileLoaded) {
    return {
      state: 'attention',
      title: 'Profile issue',
      message: 'Switch profiles or refresh this tab.',
      report,
    };
  }

  if (report.captureMode === 'fallback') {
    return {
      state: 'ready',
      title: 'Compatibility mode',
      message: 'Typing should play on this tab.',
      report,
    };
  }

  return {
    state: 'ready',
    title: 'Ready',
    message: 'Typing should play on this tab.',
    report,
  };
};

const getDiagnosticHints = tabStatus => {
  const hints = [];
  const report = tabStatus.report;
  const stats = report?.stats || {};

  if (tabStatus.state === 'disconnected') {
    if (
      tabStatus.context?.pageType === 'browser_internal' ||
      tabStatus.context?.pageType === 'chrome_web_store' ||
      tabStatus.context?.pageType === 'extension_page'
    ) {
      hints.push('Current page type is unsupported by Chrome extension content scripts.');
    } else {
      hints.push(
        'Content script is not reachable; refresh tabs that were open before install/update.'
      );
    }
  }

  if (report?.muted) {
    hints.push('Extension is muted.');
  }

  if (report?.profileLoading) {
    hints.push(
      'Selected profile is still loading; previous loaded profile should continue playing.'
    );
  }

  if (report && !report.selectedProfileLoaded && !report.activeProfileLoaded) {
    hints.push('No playable profile is loaded in the current tab.');
  }

  if (stats.audioInitFailureCount > 0) {
    hints.push('Audio context initialization failed in this tab.');
  }

  if (stats.audioResumeFailureCount > 0) {
    hints.push('Audio context resume failed after user interaction.');
  }

  if (stats.soundFetchFailureCount > 0) {
    hints.push('One or more bundled sound files could not be fetched.');
  }

  if (stats.decodeFailureCount > 0) {
    hints.push('One or more sound files could not be decoded by Web Audio.');
  }

  if (stats.profileLoadFailureCount > 0) {
    hints.push('Selected profile failed to load in this tab.');
  }

  if (stats.keyEventCount > 0 && !stats.firstSoundAt && !report?.muted) {
    hints.push('Key events were detected, but no first sound has played yet.');
  }

  if (stats.injectionFallbackCount > 0) {
    hints.push('Page is using compatibility capture mode.');
  }

  if (report?.compatibilityModes?.length > 0) {
    hints.push(`Detected compatibility mode: ${report.compatibilityModes.join(', ')}.`);
  }

  if (stats.firstSoundAt) {
    hints.push('First sound has played successfully in this tab.');
  }

  return hints;
};

const recordAnalyticsEvent = (eventName, params = {}) => {
  try {
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.ANALYTICS_EVENT,
      eventName,
      params,
    });
  } catch (error) {
    // Analytics is best-effort and must never affect popup behavior.
  }
};

const Popup = () => {
  const [soundSet, setSoundSet] = useState(DEFAULT_SETTINGS.soundSet);
  const [volume, setVolume] = useState(DEFAULT_SETTINGS.volume * 100);
  const [isMuted, setIsMuted] = useState(DEFAULT_SETTINGS.isMuted);
  const [theme, setTheme] = useState('dark');
  const [soundProfiles, setSoundProfiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tabStatus, setTabStatus] = useState({
    state: 'checking',
    title: 'Checking current tab',
    message: 'Looking for Keyboard ASMR on this page.',
    report: null,
  });
  const [diagnosticsOptIn, setDiagnosticsOptIn] = useState(false);
  const volumeWriteTimerRef = useRef(null);
  const pendingVolumeRef = useRef(null);
  const autoDiagnosticSignatureRef = useRef(null);

  // Audio context for sound preview
  const [audioContext, setAudioContext] = useState(null);
  const [soundBuffers, setSoundBuffers] = useState({});
  const [audioInitialized, setAudioInitialized] = useState(false);

  // Initialize audio context for preview
  const initializeAudio = async () => {
    if (audioInitialized) return audioContext;

    try {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      setAudioContext(context);
      setAudioInitialized(true);
      return context;
    } catch (error) {
      console.error('Failed to initialize audio for preview:', error);
      return null;
    }
  };

  const requestTabStatus = useCallback(() => {
    setTabStatus({
      state: 'checking',
      title: 'Checking current tab',
      message: 'Looking for Keyboard ASMR on this page.',
      report: null,
    });

    if (!chrome.tabs?.query) {
      setTabStatus(createDisconnectedStatus('tabs_api_unavailable', { tabsApiAvailable: false }));
      recordAnalyticsEvent('status_result', {
        statusState: 'disconnected',
        reason: 'tabs_api_unavailable',
        captureMode: 'none',
      });
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (chrome.runtime.lastError) {
        setTabStatus(
          createDisconnectedStatus('active_tab_query_failed', {
            lastErrorMessage: chrome.runtime.lastError.message,
          })
        );
        recordAnalyticsEvent('status_result', {
          statusState: 'disconnected',
          reason: 'active_tab_query_failed',
          captureMode: 'none',
        });
        return;
      }

      const activeTab = tabs?.[0];
      if (!activeTab?.id) {
        setTabStatus(createDisconnectedStatus('active_tab_missing', getTabContext(activeTab)));
        recordAnalyticsEvent('status_result', {
          statusState: 'disconnected',
          reason: 'active_tab_missing',
          captureMode: 'none',
        });
        return;
      }

      chrome.tabs.sendMessage(activeTab.id, { type: MESSAGE_TYPES.GET_STATUS }, response => {
        if (chrome.runtime.lastError || !response?.ok) {
          setTabStatus(
            createDisconnectedStatus('content_script_unavailable', {
              ...getTabContext(activeTab),
              lastErrorMessage: chrome.runtime.lastError?.message || 'no_status_response',
            })
          );
          recordAnalyticsEvent('status_result', {
            statusState: 'disconnected',
            reason: 'content_script_unavailable',
            captureMode: 'none',
          });
          return;
        }

        const status = getStatusFromReport(response);
        setTabStatus(status);
        recordAnalyticsEvent('status_result', {
          statusState: status.state,
          reason: response.stats?.lastErrorCode || 'none',
          captureMode: response.captureMode || 'unknown',
          compatibilityModes: response.compatibilityModes || [],
          errorClass: response.stats?.lastErrorCode || null,
          firstSoundLatencyMs: response.stats?.firstSoundLatencyMs ?? null,
        });
      });
    });
  }, []);

  // Load sound for preview
  const loadSoundBuffer = async (profile, context) => {
    // Use the passed context or current audioContext
    const ctx = context || audioContext;
    if (!ctx || soundBuffers[profile.id]) return;

    try {
      // Get the default keydown sound for preview (new format only)
      const defaultMapping = profile.key_mappings.default;
      const audioSourceId = defaultMapping.keydown;

      // Skip if no keydown sound configured
      if (!audioSourceId || audioSourceId === null) {
        return null;
      }

      const defaultAudioSource = profile.audio_sources[audioSourceId];
      const soundUrl = await profileLoader.resolveAudioUrl(defaultAudioSource);

      const response = await fetch(soundUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      setSoundBuffers(prev => ({
        ...prev,
        [profile.id]: audioBuffer,
      }));

      return audioBuffer;
    } catch (error) {
      console.error(`Failed to load sound for ${profile.name}:`, error);
      return null;
    }
  };

  // Play preview sound
  const playPreview = async profile => {
    if (isMuted) return;

    try {
      let context = audioContext;

      // Initialize audio on first user interaction
      if (!audioInitialized) {
        context = await initializeAudio();
      }

      if (!context) return;

      // Resume audio context if needed (Chrome autoplay policy)
      if (context.state === 'suspended') {
        await context.resume();
      }

      // Load sound if not cached, passing the context directly
      let buffer = soundBuffers[profile.id];
      if (!buffer) {
        buffer = await loadSoundBuffer(profile, context);
      }

      if (buffer && context) {
        const source = context.createBufferSource();
        const gainNode = context.createGain();

        source.buffer = buffer;
        // Use current volume setting for preview (convert from 0-100 to 0-1)
        gainNode.gain.value = volume / 100;

        source.connect(gainNode);
        gainNode.connect(context.destination);
        source.start(0);
      }
    } catch (error) {
      console.error('Failed to play preview:', error);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      // Load profiles
      try {
        const profiles = await profileLoader.loadBundledProfiles();
        // Sort profiles alphabetically by display name
        profiles.sort((a, b) => a.name.localeCompare(b.name));
        setSoundProfiles(profiles);
      } catch (error) {
        console.error('Failed to load profiles:', error);
      }

      // Load settings
      chrome.storage.sync.get(
        [
          STORAGE_KEYS.SOUND_SET,
          STORAGE_KEYS.VOLUME,
          STORAGE_KEYS.IS_MUTED,
          STORAGE_KEYS.THEME,
          STORAGE_KEYS.DIAGNOSTICS_OPT_IN,
        ],
        result => {
          setSoundSet(
            resolveSoundSetId(result[STORAGE_KEYS.SOUND_SET] || DEFAULT_SETTINGS.soundSet)
          );
          if (result[STORAGE_KEYS.VOLUME] !== undefined) setVolume(result[STORAGE_KEYS.VOLUME]);
          if (result[STORAGE_KEYS.IS_MUTED] !== undefined)
            setIsMuted(result[STORAGE_KEYS.IS_MUTED]);
          if (result[STORAGE_KEYS.THEME]) setTheme(result[STORAGE_KEYS.THEME]);
          if (result[STORAGE_KEYS.DIAGNOSTICS_OPT_IN] !== undefined) {
            setDiagnosticsOptIn(Boolean(result[STORAGE_KEYS.DIAGNOSTICS_OPT_IN]));
          }
        }
      );

      setIsLoading(false);
    };

    initialize();
    recordAnalyticsEvent('popup_open');
    requestTabStatus();
  }, [requestTabStatus]);

  useEffect(() => {
    return () => {
      if (volumeWriteTimerRef.current) {
        clearTimeout(volumeWriteTimerRef.current);
      }

      if (pendingVolumeRef.current !== null) {
        chrome.storage.sync.set({ [STORAGE_KEYS.VOLUME]: pendingVolumeRef.current });
        recordAnalyticsEvent('volume_changed', { volumePercent: pendingVolumeRef.current });
      }
    };
  }, []);

  const handleSoundSetChange = async profileId => {
    // Find the selected profile
    const selectedProfile = soundProfiles.find(profile => profile.id === profileId);

    // Play preview sound first
    if (selectedProfile) {
      await playPreview(selectedProfile);
      recordAnalyticsEvent('profile_previewed', { profileId });
    }

    // Then update the setting
    const previousProfileId = soundSet;
    setSoundSet(profileId);
    chrome.storage.sync.set({ [STORAGE_KEYS.SOUND_SET]: profileId });
    recordAnalyticsEvent('profile_selected', { profileId, previousProfileId });
    setTimeout(requestTabStatus, 200);
  };

  const handleVolumeChange = event => {
    const newVolume = parseInt(event.target.value, 10);
    setVolume(newVolume);
    pendingVolumeRef.current = newVolume;

    if (volumeWriteTimerRef.current) {
      clearTimeout(volumeWriteTimerRef.current);
    }

    volumeWriteTimerRef.current = setTimeout(() => {
      chrome.storage.sync.set({ [STORAGE_KEYS.VOLUME]: newVolume });
      recordAnalyticsEvent('volume_changed', { volumePercent: newVolume });
      pendingVolumeRef.current = null;
      volumeWriteTimerRef.current = null;
    }, VOLUME_WRITE_DELAY);
  };

  const flushVolumeChange = () => {
    if (volumeWriteTimerRef.current) {
      clearTimeout(volumeWriteTimerRef.current);
      volumeWriteTimerRef.current = null;
    }

    if (pendingVolumeRef.current !== null) {
      chrome.storage.sync.set({ [STORAGE_KEYS.VOLUME]: pendingVolumeRef.current });
      recordAnalyticsEvent('volume_changed', { volumePercent: pendingVolumeRef.current });
      pendingVolumeRef.current = null;
    }
  };

  const toggleMute = () => {
    const muteState = !isMuted;
    setIsMuted(muteState);
    chrome.storage.sync.set({ [STORAGE_KEYS.IS_MUTED]: muteState });
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.TOGGLE_MUTE,
      isMuted: muteState,
    });
    recordAnalyticsEvent('mute_toggled', { muted: muteState });
    setTimeout(requestTabStatus, 100);
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    chrome.storage.sync.set({ [STORAGE_KEYS.THEME]: newTheme });
  };

  const buildDiagnosticPayload = useCallback(() => {
    const selectedProfile = soundProfiles.find(profile => profile.id === soundSet);
    const diagnosticHints = getDiagnosticHints(tabStatus);

    return {
      generatedAt: new Date().toISOString(),
      privacy: {
        excludes: ['typed text', 'raw key values', 'raw page URLs', 'browsing history'],
      },
      extension: {
        version: chrome.runtime.getManifest?.().version || 'unknown',
      },
      environment: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
      },
      popup: {
        statusState: tabStatus.state,
        statusTitle: tabStatus.title,
        selectedProfile: soundSet,
        selectedProfileName: selectedProfile?.name || 'unknown',
        muted: isMuted,
        volumePercent: volume,
        profilesLoaded: soundProfiles.length,
      },
      diagnostics: {
        optIn: diagnosticsOptIn,
        uploadConfigured: isDiagnosticUploadConfigured(),
      },
      diagnosis: {
        hints: diagnosticHints,
        lastErrorCode: tabStatus.report?.stats?.lastErrorCode || null,
        lastErrorAt: tabStatus.report?.stats?.lastErrorAt || null,
        lastErrorContext: tabStatus.report?.stats?.lastErrorContext || null,
        firstSoundAt: tabStatus.report?.stats?.firstSoundAt || null,
        firstSoundLatencyMs: tabStatus.report?.stats?.firstSoundLatencyMs || null,
        firstSoundFailureCode: tabStatus.report?.stats?.firstSoundFailureCode || null,
        keyCategoryCounts: tabStatus.report?.stats?.keyCategoryCounts || {},
        compatibilityModes: tabStatus.report?.compatibilityModes || [],
      },
      tab: tabStatus.report || {
        state: tabStatus.state,
        reason: tabStatus.reason || 'no_content_status',
        context: tabStatus.context || {},
      },
    };
  }, [diagnosticsOptIn, isMuted, soundProfiles, soundSet, tabStatus, volume]);

  const shareDiagnosticReport = useCallback(
    async ({ automatic = false } = {}) => {
      if (!isDiagnosticUploadConfigured()) {
        return;
      }

      if (automatic && !diagnosticsOptIn) {
        return;
      }

      const payload = buildDiagnosticPayload();

      try {
        await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            {
              type: MESSAGE_TYPES.DIAGNOSTIC_REPORT_UPLOAD,
              report: payload,
              automatic,
            },
            response => {
              if (chrome.runtime.lastError || !response?.ok) {
                reject(
                  new Error(
                    chrome.runtime.lastError?.message ||
                      response?.error ||
                      'diagnostic_upload_failed'
                  )
                );
                return;
              }
              resolve();
            }
          );
        });

        recordAnalyticsEvent('diagnostic_shared', { automatic });
      } catch (error) {
        console.error('Failed to share diagnostic report:', error);
        recordAnalyticsEvent('diagnostic_share_failed', { automatic });
      }
    },
    [buildDiagnosticPayload, diagnosticsOptIn]
  );

  const toggleDiagnosticsOptIn = () => {
    const nextValue = !diagnosticsOptIn;
    setDiagnosticsOptIn(nextValue);
    chrome.storage.sync.set({ [STORAGE_KEYS.DIAGNOSTICS_OPT_IN]: nextValue });
    recordAnalyticsEvent('diagnostics_opt_in_changed', { enabled: nextValue });
  };

  useEffect(() => {
    if (!diagnosticsOptIn || !isDiagnosticUploadConfigured()) return;
    if (!['attention', 'disconnected'].includes(tabStatus.state)) return;

    const signature = [
      tabStatus.state,
      tabStatus.reason || tabStatus.report?.stats?.lastErrorCode || 'none',
      tabStatus.report?.captureMode || 'none',
    ].join(':');

    if (autoDiagnosticSignatureRef.current === signature) return;
    autoDiagnosticSignatureRef.current = signature;
    shareDiagnosticReport({ automatic: true });
  }, [diagnosticsOptIn, shareDiagnosticReport, tabStatus]);

  const diagnosticsUploadReady = isDiagnosticUploadConfigured();

  return (
    <div className={`popup-container ${theme}`}>
      {/* Header */}
      <div className='header'>
        <div className='logo-section'>
          <span className='logo'>⌨️</span>
          <div>
            <h1>Keyboard ASMR</h1>
            <p className='tagline'>Indulge in your typing experience</p>
          </div>
        </div>
        <div className='header-actions'>
          <a
            href='https://discord.gg/2jcP6RBTPq'
            target='_blank'
            rel='noopener noreferrer'
            className='icon-btn discord-btn'
            title='Join Discord community'
          >
            <svg width='16' height='16' viewBox='0 0 24 24' fill='currentColor'>
              <path d='M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z' />
            </svg>
          </a>
          <button className='icon-btn' onClick={toggleTheme} title='Toggle theme'>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      {/* Sound Profiles */}
      <div className='sound-profiles'>
        <h2>
          Sound Profiles
          {!isLoading && soundProfiles.length > 0 && (
            <span className='current-profile'>
              {' - '}
              {soundProfiles.find(profile => profile.id === soundSet)?.name || 'Unknown'}
            </span>
          )}
        </h2>
        <div className='profiles-grid'>
          {isLoading ? (
            <div className='loading-state'>Loading profiles...</div>
          ) : (
            soundProfiles.map(profile => (
              <div
                key={profile.id}
                className={`profile-card ${soundSet === profile.id ? 'active' : ''}`}
                onClick={() => handleSoundSetChange(profile.id)}
                style={{ '--gradient': profile.ui.color }}
              >
                <div className='profile-icon'>{profile.ui.icon}</div>
                <div className='profile-info'>
                  <h3>{profile.name}</h3>
                  <p>{profile.description}</p>
                </div>
                {soundSet === profile.id && (
                  <div className='active-indicator'>
                    <span className='checkmark'>✓</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Volume Control */}
      <div className='volume-section'>
        <div className='volume-header'>
          <h2>Volume Control</h2>
          <button className={`mute-toggle ${isMuted ? 'muted' : ''}`} onClick={toggleMute}>
            {isMuted ? '🔇' : '🔊'}
          </button>
        </div>
        <div className='volume-control'>
          <span className='volume-icon'>🔈</span>
          <div className='volume-slider-container'>
            <input
              type='range'
              min='0'
              max='100'
              value={volume}
              onChange={handleVolumeChange}
              onBlur={flushVolumeChange}
              onKeyUp={flushVolumeChange}
              onPointerUp={flushVolumeChange}
              className='volume-slider'
              disabled={isMuted}
              style={{
                '--volume-percent': `${volume}%`,
              }}
            />
            <div className='volume-value'>{volume}%</div>
          </div>
        </div>
      </div>

      {diagnosticsUploadReady && (
        <div className='diagnostics-section'>
          <label className='diagnostics-toggle'>
            <span>
              <strong>Diagnostics</strong>
              <small>Status and error codes only</small>
            </span>
            <input type='checkbox' checked={diagnosticsOptIn} onChange={toggleDiagnosticsOptIn} />
            <span className='toggle-switch' />
          </label>
        </div>
      )}

      {/* Footer */}
      <div className='footer'>
        <a
          href='https://chromewebstore.google.com/detail/keyboard-asmr/aebnkjebahjkkpiknggemolakkjggiab'
          target='_blank'
          rel='noopener noreferrer'
          className='review-link'
        >
          <span className='review-icon'>⭐</span>
          <span className='review-text'>Enjoying Keyboard ASMR? Leave a review!</span>
        </a>
      </div>
    </div>
  );
};

export default Popup;
