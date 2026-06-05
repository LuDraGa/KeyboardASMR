export const ANALYTICS_CONFIG = {
  proxyEndpoint: process.env.GA4_PROXY_ENDPOINT || '',
  dailyRetentionDays: 14,
};

export const isAnalyticsConfigured = () => Boolean(ANALYTICS_CONFIG.proxyEndpoint);
