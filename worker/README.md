# Keyboard ASMR GA4 Proxy Worker

Cloudflare Workers Builds root directory: `/worker`.

This Worker keeps `GA4_API_SECRET` out of the Chrome extension bundle. The extension sends daily aggregate analytics to `/ga4`; the Worker validates the payload, adds `GA4_MEASUREMENT_ID` and `GA4_API_SECRET` from Cloudflare settings, then forwards to GA4 Measurement Protocol.

## Cloudflare Settings

Set these in Worker Settings > Variables & Secrets:

- `GA4_MEASUREMENT_ID`: plain variable, for example `G-S42K14ZJCY`
- `GA4_API_SECRET`: secret

Optional:

- `ALLOWED_ORIGIN`: set after the Chrome extension ID is stable, for example `chrome-extension://<extension-id>`

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
