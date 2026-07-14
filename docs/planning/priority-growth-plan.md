# Keyboard ASMR Priority Growth Plan

## Constraints

- Do not add broad Chrome permissions while the excessive-permissions review is active.
- Do not collect typed content, raw key values, raw URLs, or browsing history.
- Keep reliability work ahead of monetization so paid features do not amplify support issues.
- Update Chrome Web Store privacy disclosures before shipping analytics or diagnostic uploads.
- Treat Chrome Web Store GA opt-in as listing analytics only; do not assume it covers in-extension usage.
- Do not add in-extension analytics until cost, limits, privacy disclosure, and implementation path are confirmed.

## Phase 1: Review-Safe Reliability

- [x] Remove runtime code paths that rely on undeclared or unnecessary Chrome APIs.
- [x] Add hidden popup troubleshooting that explains whether the current tab can run the extension.
- [x] Add a one-click local support report with audio state, profile state, injection mode, and last error.
- [x] Add diagnosis hints to local support reports without raw keys or raw page URLs.
- [x] Show refresh guidance only when the popup cannot reach the current tab.
- [x] Add install/update guidance: refresh existing tabs; unsupported on Chrome Web Store, chrome:// pages, and address bar.
- [x] Add compatibility test pages for input, textarea, contenteditable, same-origin iframe, cross-origin iframe, and editor-like surfaces.
- [x] Add endpoint-gated opt-in diagnostic report upload with manual share and auto-share on failure after opt-in.
- [x] Draft Chrome Web Store privacy disclosure and release gate checklist.
- [ ] Configure diagnostic report endpoint and apply final Chrome Web Store privacy disclosure before enabling uploads in release builds.

## Phase 2: Performance

- [x] Lazy-load only the selected sound profile in content scripts.
- [x] Move bundled profile/audio validation to build time.
- [x] Cache decoded audio buffers per profile and avoid reloading all profiles when one setting changes.
- [x] Debounce high-frequency storage writes from volume slider changes.
- [x] Add lightweight runtime counters for injection fallback, audio init failure, decode failure, and first sound success.

## Phase 3: Privacy-Safe Analytics

- Decision gate: do this after the focused product work, using only free instrumentation paths unless approved.
- [ ] Enable the Chrome Web Store Developer Dashboard GA opt-in for listing views and install events.
- [ ] Confirm whether the dashboard-created GA4 property exposes a Measurement Protocol API secret for in-extension events.
- [x] Implement config-gated GA4 Measurement Protocol with an anonymous client id in `chrome.storage.local`.
- [x] Aggregate profile changes and per-profile usage counts locally, then flush at most once per day.
- [x] Track install/update, popup open, profile select, preview play, mute state, exact active/selected volume, status result, diagnostic copy, and first sound success.
- [x] Separate eligible playback attempts/failures from intentionally unmapped and muted key events.
- [x] Track error classes only, not typed keys, typed text, raw page URLs, or browsing history.
- [x] Add a privacy note in popup/settings before enabling diagnostic upload.
- [x] Draft final Chrome Web Store privacy disclosure before enabling diagnostic upload or analytics in release builds.
- [x] Create GA dashboard setup guide for activation, profile demand, reliability failure rate, retention, and conversion intent.
- [ ] Apply Chrome Web Store privacy disclosure and create the GA4 reports in the external dashboards.

## Phase 4: Product Upgrades

- [ ] Per-site settings: enable/disable, profile, and volume by domain.
- [x] Key-category playback mapping: letters, numbers, space, enter, backspace, arrows, modifiers, and WASD.
- [ ] Humanization controls: pitch variation, volume variation, repeat behavior, press/release mode, and loudness normalization.
- [ ] Custom sound importer for local WAV/MP3 packs.
- [ ] Ambience layer: rain, room tone, lofi, white noise, and desk ambience.
- [x] Better compatibility modes for Google Docs, ChatGPT, Notion, Slack, Discord, and code editors.

## Phase 5: Monetization

- [ ] Freemium model: useful free base profiles plus premium pack bundles.
- [ ] Start with a lifetime unlock before testing subscriptions.
- [ ] Add a premium pack pipeline with licensing checks before using brand or switch names commercially.
- [ ] Add partner/sponsored packs only with clear disclosure and licensed assets.
- [ ] Add affiliate links only from explicit user clicks in popup/website, never injected into pages.
- [ ] Explore a paid desktop companion for system-wide typing sounds beyond browser pages.

## Phase 6: Expansion

- [ ] Publish Edge and Firefox builds after reliability metrics improve.
- [ ] Build a small landing site for SEO and premium pack sales.
- [ ] Use short demos to market profile differences.
- [ ] Add a public request board for sound packs and compatibility reports.
- [ ] Localize popup/listing for top traffic geographies once analytics identifies them.

## Current Next Step

Next: apply the Chrome Web Store privacy disclosure, create the GA4 reports, and provide release env vars only after those external steps are complete.
