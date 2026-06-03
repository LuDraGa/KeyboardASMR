export const ANALYTICS_CONFIG = {
  measurementId: process.env.GA4_MEASUREMENT_ID || '',
  apiSecret: process.env.GA4_API_SECRET || '',
  endpoint: 'https://www.google-analytics.com/mp/collect',
  dailyRetentionDays: 14,
};

export const isAnalyticsConfigured = () =>
  Boolean(ANALYTICS_CONFIG.measurementId && ANALYTICS_CONFIG.apiSecret);
