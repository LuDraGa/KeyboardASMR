# Keyboard ASMR GA4 Proxy Worker

Cloudflare Workers Builds root directory: `/worker`.

This Worker keeps `GA4_API_SECRET` out of the Chrome extension bundle. The extension sends daily aggregate analytics to `/ga4`; the Worker validates the payload, adds `GA4_MEASUREMENT_ID` and `GA4_API_SECRET` from Cloudflare settings, then forwards to GA4 Measurement Protocol.

## Cloudflare Settings

- `GA4_MEASUREMENT_ID`: declared in `wrangler.jsonc` under `vars` (for example `G-S42K14ZJCY`). **Do not** set this as a plain variable in the dashboard — `wrangler deploy` (run by Workers Builds on every push) treats the `vars` block in config as authoritative and wipes any dashboard-only plain variable. That is exactly how the measurement ID silently disappeared and `/ga4` started returning `500 ga4_not_configured`.
- `GA4_API_SECRET`: secret only. Set via `wrangler secret put GA4_API_SECRET` or dashboard > Variables & Secrets > _Encrypt_. Secrets are a separate store that deploys never overwrite, so this one survives. Never put it in `vars`.

Optional:

- `ALLOWED_ORIGIN`: lock down CORS once the Chrome extension ID is stable, for example `chrome-extension://<extension-id>`. Add it to the `vars` block in `wrangler.jsonc` (not the dashboard), same reasoning as above.

## GitHub Build Settings

- Root directory: `/worker`
- Build command: leave blank
- Deploy command: `npm run deploy`

The Worker name in Cloudflare must match `name` in `wrangler.jsonc`. Rename either side if the dashboard project already uses a different name.

## Extension Build

After the Worker is deployed, put the public Worker URL in local `.env`:

```bash
GA4_PROXY_ENDPOINT=https://keyboardasmr.<account>.workers.dev
```

Then build:

```bash
npm run build
```

Do not put `GA4_API_SECRET` or `GA4_MEASUREMENT_ID` in the extension release build.

## Endpoints

- `GET /health`: health check
- `POST /ga4`: analytics ingest

`/ga4` accepts only the daily aggregate event names and parameters used by the extension.
