interface Env {
  GA4_MEASUREMENT_ID: string;
  GA4_API_SECRET: string;
  ALLOWED_ORIGIN?: string;
}

type AnalyticsEvent = {
  name: string;
  params?: Record<string, unknown>;
};

type AnalyticsPayload = {
  client_id?: unknown;
  events?: unknown;
};

const GA4_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const MAX_BODY_BYTES = 32_768;
const MAX_EVENTS_PER_REQUEST = 25;

const ALLOWED_EVENT_NAMES = new Set([
  'daily_popup_usage',
  'daily_extension_lifecycle',
  'daily_diagnostics_usage',
  'daily_profile_usage',
  'daily_status_result',
  'daily_status_reason',
  'daily_capture_mode',
  'daily_compatibility_mode',
  'daily_error_class',
  'daily_volume_selection',
  'daily_mute_state_change',
  'daily_first_sound_latency',
]);

const CUSTOM_DIMENSION_PARAM_KEYS = new Set([
  'event_date',
  'profile_id',
  'status_state',
  'status_reason',
  'capture_mode',
  'compatibility_mode',
  'error_class',
  'volume_percent',
  'mute_state',
  'latency_bucket',
]);

const CUSTOM_METRIC_PARAM_KEYS = new Set([
  'popup_open_count',
  'profile_select_count',
  'preview_play_count',
  'mute_toggle_count',
  'diagnostic_copy_count',
  'volume_change_count',
  'install_count',
  'update_count',
  'opt_in_count',
  'opt_out_count',
  'share_count',
  'auto_share_count',
  'share_failure_count',
  'selected_count',
  'previewed_count',
  'key_event_count',
  'played_sound_count',
  'playback_attempt_count',
  'playback_failure_count',
  'muted_key_event_count',
  'unmapped_event_count',
  'first_sound_success_count',
  'active_volume_count',
  'status_count',
  'reason_count',
  'mode_count',
  'error_count',
  'volume_selection_count',
  'mute_state_change_count',
  'latency_count',
]);

const INTERNAL_NUMERIC_PARAM_KEYS = new Set(['engagement_time_msec', 'session_id']);

function getCorsHeaders(request: Request, env: Env): HeadersInit {
  const requestOrigin = request.headers.get('Origin');
  const allowedOrigin = env.ALLOWED_ORIGIN || requestOrigin || '*';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function jsonResponse(request: Request, env: Env, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(request, env),
      ...(init.headers || {}),
    },
  });
}

function emptyResponse(request: Request, env: Env, init: ResponseInit = {}) {
  return new Response(null, {
    ...init,
    headers: {
      ...getCorsHeaders(request, env),
      ...(init.headers || {}),
    },
  });
}

function isAllowedOrigin(request: Request, env: Env) {
  if (!env.ALLOWED_ORIGIN) return true;
  return request.headers.get('Origin') === env.ALLOWED_ORIGIN;
}

function isValidClientId(clientId: unknown): clientId is string {
  return typeof clientId === 'string' && /^[A-Za-z0-9._-]{8,128}$/.test(clientId);
}

function sanitizeParamValue(key: string, value: unknown) {
  if (CUSTOM_DIMENSION_PARAM_KEYS.has(key)) {
    if (typeof value !== 'string') return undefined;
    return value.slice(0, 100);
  }

  if (CUSTOM_METRIC_PARAM_KEYS.has(key) || INTERNAL_NUMERIC_PARAM_KEYS.has(key)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return Math.max(0, Math.min(Math.floor(value), 1_000_000_000));
  }

  return undefined;
}

function sanitizeEvent(event: unknown): AnalyticsEvent | null {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return null;
  }

  const candidate = event as AnalyticsEvent;
  if (typeof candidate.name !== 'string' || !ALLOWED_EVENT_NAMES.has(candidate.name)) {
    return null;
  }

  const sanitizedParams: Record<string, string | number | boolean> = {};
  const params = candidate.params || {};

  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return {
      name: candidate.name,
      params: sanitizedParams,
    };
  }

  for (const [key, value] of Object.entries(params)) {
    if (
      !CUSTOM_DIMENSION_PARAM_KEYS.has(key) &&
      !CUSTOM_METRIC_PARAM_KEYS.has(key) &&
      !INTERNAL_NUMERIC_PARAM_KEYS.has(key)
    ) {
      continue;
    }

    const sanitizedValue = sanitizeParamValue(key, value);
    if (sanitizedValue !== undefined) {
      sanitizedParams[key] = sanitizedValue;
    }
  }

  return {
    name: candidate.name,
    params: sanitizedParams,
  };
}

async function parsePayload(request: Request): Promise<AnalyticsPayload> {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    throw new Error('request_body_too_large');
  }

  const bodyText = await request.text();
  if (bodyText.length > MAX_BODY_BYTES) {
    throw new Error('request_body_too_large');
  }

  try {
    return JSON.parse(bodyText) as AnalyticsPayload;
  } catch {
    throw new Error('invalid_json');
  }
}

async function handleGa4Request(request: Request, env: Env) {
  if (!env.GA4_MEASUREMENT_ID || !env.GA4_API_SECRET) {
    return jsonResponse(request, env, { error: 'ga4_not_configured' }, { status: 500 });
  }

  if (!isAllowedOrigin(request, env)) {
    return jsonResponse(request, env, { error: 'origin_not_allowed' }, { status: 403 });
  }

  if (!request.headers.get('Content-Type')?.includes('application/json')) {
    return jsonResponse(request, env, { error: 'content_type_must_be_json' }, { status: 415 });
  }

  let payload: AnalyticsPayload;
  try {
    payload = await parsePayload(request);
  } catch (error) {
    return jsonResponse(
      request,
      env,
      { error: error instanceof Error ? error.message : 'invalid_payload' },
      { status: 400 }
    );
  }

  if (!isValidClientId(payload.client_id)) {
    return jsonResponse(request, env, { error: 'invalid_client_id' }, { status: 400 });
  }

  if (!Array.isArray(payload.events) || payload.events.length === 0) {
    return jsonResponse(request, env, { error: 'events_required' }, { status: 400 });
  }

  if (payload.events.length > MAX_EVENTS_PER_REQUEST) {
    return jsonResponse(request, env, { error: 'too_many_events' }, { status: 400 });
  }

  const events = payload.events
    .map(sanitizeEvent)
    .filter((event): event is AnalyticsEvent => Boolean(event));

  if (events.length === 0) {
    return jsonResponse(request, env, { error: 'no_valid_events' }, { status: 400 });
  }

  const ga4Url = `${GA4_ENDPOINT}?measurement_id=${encodeURIComponent(
    env.GA4_MEASUREMENT_ID
  )}&api_secret=${encodeURIComponent(env.GA4_API_SECRET)}`;

  const response = await fetch(ga4Url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: payload.client_id,
      events,
    }),
  });

  // Surface event names + params in Worker Logs so /ga4 lines are distinguishable
  // (e.g. which profile_id, the aggregate counts). Params are already sanitized to
  // the GA4 allow-list — no raw body, no PII; client_id truncated to a fingerprint.
  console.log(
    'ga4_ingest',
    JSON.stringify({
      ray: request.headers.get('cf-ray'),
      client: typeof payload.client_id === 'string' ? payload.client_id.slice(0, 8) : null,
      events: events.map(event => ({ name: event.name, params: event.params })),
      forward: response.status,
    })
  );

  if (!response.ok) {
    return jsonResponse(
      request,
      env,
      { error: 'ga4_forward_failed', status: response.status },
      { status: 502 }
    );
  }

  return emptyResponse(request, env, { status: 204 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return emptyResponse(request, env, { status: 204 });
    }

    if (url.pathname === '/health') {
      return jsonResponse(request, env, { ok: true });
    }

    if (url.pathname !== '/ga4') {
      return jsonResponse(request, env, { error: 'not_found' }, { status: 404 });
    }

    if (request.method !== 'POST') {
      return jsonResponse(request, env, { error: 'method_not_allowed' }, { status: 405 });
    }

    return handleGa4Request(request, env);
  },
};
