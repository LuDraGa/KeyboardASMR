import { afterEach, describe, expect, it, vi } from 'vitest';

import analyticsWorker from '../../worker/src/index';

describe('analytics Worker forwarding contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('forwards corrected playback outcomes and strips the archived dropped metric', async () => {
    const forwardToGa = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', forwardToGa);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const response = await analyticsWorker.fetch(
      new Request('https://analytics.example/ga4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'client-12345678',
          events: [
            {
              name: 'daily_profile_usage',
              params: {
                event_date: '2026-07-14',
                profile_id: 'typewriter',
                playback_attempt_count: 100,
                playback_failure_count: 2,
                muted_key_event_count: 40,
                unmapped_event_count: 85,
                volume_percent: '42',
                active_volume_count: 1,
                dropped_sound_count: 999,
              },
            },
          ],
        }),
      }),
      {
        GA4_MEASUREMENT_ID: 'G-TEST',
        GA4_API_SECRET: 'secret',
      }
    );

    expect(response.status).toBe(204);
    const forwardedPayload = JSON.parse(forwardToGa.mock.calls[0][1].body);
    expect(forwardedPayload.events[0].params).toEqual({
      event_date: '2026-07-14',
      profile_id: 'typewriter',
      playback_attempt_count: 100,
      playback_failure_count: 2,
      muted_key_event_count: 40,
      unmapped_event_count: 85,
      volume_percent: '42',
      active_volume_count: 1,
    });
  });

  it('forwards exact volume selections and mute-state changes as separate events', async () => {
    const forwardToGa = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', forwardToGa);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const response = await analyticsWorker.fetch(
      new Request('https://analytics.example/ga4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'client-12345678',
          events: [
            {
              name: 'daily_volume_selection',
              params: { volume_percent: '37', volume_selection_count: 3 },
            },
            {
              name: 'daily_mute_state_change',
              params: { mute_state: 'muted', mute_state_change_count: 1 },
            },
          ],
        }),
      }),
      {
        GA4_MEASUREMENT_ID: 'G-TEST',
        GA4_API_SECRET: 'secret',
      }
    );

    expect(response.status).toBe(204);
    const forwardedPayload = JSON.parse(forwardToGa.mock.calls[0][1].body);
    expect(forwardedPayload.events).toEqual([
      {
        name: 'daily_volume_selection',
        params: { volume_percent: '37', volume_selection_count: 3 },
      },
      {
        name: 'daily_mute_state_change',
        params: { mute_state: 'muted', mute_state_change_count: 1 },
      },
    ]);
  });
});
