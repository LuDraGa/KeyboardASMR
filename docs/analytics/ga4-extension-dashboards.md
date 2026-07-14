# GA4 Dashboards For Keyboard ASMR

This extension does not use page tags. It sends daily aggregate events from the MV3 service worker to the Cloudflare Worker GA4 proxy only when `GA4_PROXY_ENDPOINT` is configured.

For a Chrome extension, set up GA4 like a web stream, but build reports around custom events rather than page views. Keep `GA4_API_SECRET` only in Cloudflare Worker settings, never in the extension bundle.

## Setup

1. In GA4, create or use a Web data stream.
2. In the Web stream details, create a Measurement Protocol API secret.
3. In Cloudflare Worker Settings > Variables & Secrets, set:

   - `GA4_MEASUREMENT_ID`
   - `GA4_API_SECRET`

4. Deploy the Worker from `/worker`.
5. Put the public Worker endpoint in local `.env`:

```bash
GA4_PROXY_ENDPOINT=https://keyboardasmr.<account>.workers.dev
```

6. Build the extension:

```bash
npm run build
```

7. Wait until at least one full day has passed with usage, because the extension flushes previous-day aggregate buckets at most once per day.
8. Register the custom dimensions and metrics below before building reports.

## Custom Dimensions

Create these as event-scoped custom dimensions in Admin > Data display > Custom definitions.
Do not rename these event parameters; GA4 custom definitions are tied to the exact names.

| Dimension name     | Event parameter      |
| ------------------ | -------------------- |
| Event date         | `event_date`         |
| Profile ID         | `profile_id`         |
| Status state       | `status_state`       |
| Status reason      | `status_reason`      |
| Capture mode       | `capture_mode`       |
| Compatibility mode | `compatibility_mode` |
| Error class        | `error_class`        |
| Volume percent     | `volume_percent`     |
| Mute state         | `mute_state`         |
| Latency bucket     | `latency_bucket`     |

## Custom Metrics

Create these as event-scoped custom metrics.
Metrics must be sent as numeric count parameters, not strings.

| Metric name                    | Event parameter             | Unit     |
| ------------------------------ | --------------------------- | -------- |
| Popup open count               | `popup_open_count`          | Standard |
| Profile select count           | `profile_select_count`      | Standard |
| Preview play count             | `preview_play_count`        | Standard |
| Mute toggle count              | `mute_toggle_count`         | Standard |
| Diagnostic copy count          | `diagnostic_copy_count`     | Standard |
| Volume change count            | `volume_change_count`       | Standard |
| Install count                  | `install_count`             | Standard |
| Update count                   | `update_count`              | Standard |
| Selected count                 | `selected_count`            | Standard |
| Previewed count                | `previewed_count`           | Standard |
| Key event count                | `key_event_count`           | Standard |
| Played sound count             | `played_sound_count`        | Standard |
| Playback attempt count         | `playback_attempt_count`    | Standard |
| Playback failure count         | `playback_failure_count`    | Standard |
| Muted key event count          | `muted_key_event_count`     | Standard |
| Unmapped event count           | `unmapped_event_count`      | Standard |
| First sound success count      | `first_sound_success_count` | Standard |
| Active volume count            | `active_volume_count`       | Standard |
| Status count                   | `status_count`              | Standard |
| Reason count                   | `reason_count`              | Standard |
| Mode count                     | `mode_count`                | Standard |
| Error count                    | `error_count`               | Standard |
| Volume selection count         | `volume_selection_count`    | Standard |
| Mute state change count        | `mute_state_change_count`   | Standard |
| Latency count                  | `latency_count`             | Standard |
| Diagnostic opt-in count        | `opt_in_count`              | Standard |
| Diagnostic opt-out count       | `opt_out_count`             | Standard |
| Diagnostic share count         | `share_count`               | Standard |
| Diagnostic auto-share count    | `auto_share_count`          | Standard |
| Diagnostic share failure count | `share_failure_count`       | Standard |

GA4 can take 24-48 hours after parameters arrive and definitions are created before these fields are available in reports.

## Metric Migration

Archive the old `Dropped sound count` custom metric (`dropped_sound_count`). It counted intentionally unmapped keyup and repeated-key events, so its historical values are not a reliability signal. Also archive the old `Volume bucket` dimension (`volume_bucket`) and `Volume count` metric (`volume_count`).

GA4 cannot selectively delete the old dropped-sound values because data-deletion requests do not delete numeric parameters. Archiving a custom definition stops it from being used in new reports but preserves its historical data. Start corrected reliability and volume reports on the release date that first emits the new parameters.

The corrected playback outcomes are:

- `playback_attempt_count`: events whose selected profile declares a sound for the captured event type.
- `played_sound_count`: declared sounds that started successfully.
- `playback_failure_count`: declared sounds that could not start.
- `unmapped_event_count`: intentionally silent event types, including profiles without keyup or repeated-key mappings.
- `muted_key_event_count`: captured keys while the extension was muted.

Muted and unmapped events are never playback attempts or failures.

## Reports To Build

### Activation

Goal: understand if installed users reach sound playback.

Report type: Explore > Free form.

Rows:

- `event_date`

Metrics:

- `install_count`
- `update_count`
- `popup_open_count`
- `first_sound_success_count`
- `played_sound_count`
- `playback_attempt_count`
- `playback_failure_count`

Filters:

- Event name exactly matches `daily_extension_lifecycle`, `daily_popup_usage`, or `daily_profile_usage`.

Useful calculated checks:

- First sound success rate = `first_sound_success_count / popup_open_count`
- Playback failure rate = `playback_failure_count / playback_attempt_count`

### Profile Demand

Goal: decide which sound profiles deserve more polish, variants, or paid packs later.

Report type: Explore > Free form.

Rows:

- `profile_id`

Metrics:

- `selected_count`
- `previewed_count`
- `key_event_count`
- `played_sound_count`

Filters:

- Event name exactly matches `daily_profile_usage`.

Sort:

- `selected_count` descending.

Read:

- High previews but low selected counts means the card is interesting but the sound may disappoint.
- High key event count means retained usage, not just curiosity.

### Reliability Failure Rate

Goal: identify why users say the extension is not working.

Report type: Explore > Free form.

Rows:

- `profile_id`
- `status_state`
- `status_reason`
- `error_class`
- `capture_mode`
- `compatibility_mode`

Metrics:

- `status_count`
- `reason_count`
- `error_count`
- `mode_count`
- `playback_attempt_count`
- `playback_failure_count`
- `unmapped_event_count`
- `muted_key_event_count`

Filters:

- Event name exactly matches `daily_status_result`, `daily_status_reason`, `daily_error_class`, `daily_capture_mode`, or `daily_compatibility_mode`.

Read:

- `content_script_unavailable` usually means refresh-needed, unsupported page, or install/update tab state.
- `profile_load_failed`, `sound_fetch_failed`, or `sound_decode_failed` points to bundled asset/profile problems.
- A high fallback mode share means compatibility code is doing useful work on difficult editors.
- Playback failure rate is `playback_failure_count / playback_attempt_count`; do not include muted or unmapped events in its denominator.
- `unmapped_event_count` measures intentional profile coverage, while `muted_key_event_count` measures captured typing while disabled.

### Volume And Mute

Goal: understand exact listening levels and explicit mute behavior without conflating the two.

Report type: Explore > Free form.

Rows:

- `volume_percent`
- `mute_state`

Metrics:

- `active_volume_count`
- `volume_selection_count`
- `mute_state_change_count`
- `muted_key_event_count`

Filters:

- Event name exactly matches `daily_profile_usage`, `daily_volume_selection`, or `daily_mute_state_change`.

Read:

- `volume_percent` on `daily_profile_usage` is the latest exact 0-100 volume used for successful playback in each daily profile bucket; `active_volume_count` makes that value countable as a distribution.
- `volume_selection_count` counts deliberate final slider selections at each exact 0-100 value.
- Volume zero remains a volume setting. `mute_state = muted` is tracked independently.

### Retention

Goal: see whether users keep using the extension after activation.

Report type: Explore > Cohort exploration or Free form.

Dimensions:

- First user date, date, or `event_date`.

Metrics:

- Active users
- `popup_open_count`
- `played_sound_count`
- `key_event_count`

Filters:

- Event name exactly matches `daily_popup_usage` or `daily_profile_usage`.

Read:

- Prefer `key_event_count` and `played_sound_count` over popup opens for real retained usage.
- Treat this as directional because the extension sends daily aggregate events, not every session.

### Conversion Intent

Goal: measure readiness for monetization without shipping payments yet.

Current available signals:

- `previewed_count`
- `selected_count`
- `key_event_count`
- `diagnostic_copy_count`
- `share_count`

Suggested future events before monetization:

- `upgrade_intent_clicked`
- `premium_pack_previewed`
- `premium_pack_waitlist_joined`

Do not add these until the product decision is approved.

## Dashboard Navigation

GA4 reports are not configured like a normal website dashboard here.

Use this flow:

1. GA4 > Reports > Engagement > Events to confirm events are arriving.
2. GA4 > Admin > Data display > Custom definitions to register dimensions/metrics.
3. GA4 > Explore to build the reports above.
4. Optional: GA4 > Reports > Library to publish a custom collection after the Explore reports prove useful.

## Source Notes

- Chrome extension GA4 setup uses a Web data stream and Measurement Protocol: https://developer.chrome.com/docs/extensions/how-to/integrate/google-analytics-4
- GA4 custom definitions are needed to report on event parameters: https://support.google.com/analytics/answer/14240153
- GA4 custom metrics can take 24-48 hours before appearing in reports: https://support.google.com/analytics/answer/14239619
- GA4 data-deletion requests do not delete numeric parameters: https://support.google.com/analytics/answer/9940393
- Archiving custom dimensions or metrics preserves historical data: https://support.google.com/analytics/answer/12436143
- GA4 detail reports can be customized from report data, filters, metrics, dimensions, and charts: https://support.google.com/analytics/answer/10445879
