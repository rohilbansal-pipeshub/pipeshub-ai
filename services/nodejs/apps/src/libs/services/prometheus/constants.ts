// these are the fields that would present in grafana to filter
export const apiCallCounterFields = {
  fieldName: 'api_calls_total',
  description: 'Total number of API calls',
  label: ['method', 'endpoint', 'userId', 'orgId', 'email'],
};

export const activeUsersFields = {
  fieldName: 'active_users_count',
  description: 'Number of active users by type',
  label: ['type', 'email'],
};

export const userActivityFields = {
  fieldName: 'user_activity_total',
  description: 'User activity tracker',
  label: ['activity', 'userId', 'orgId', 'email'],
};

export const routeUsageFields = {
  fieldName: 'route_usage_total',
  description: 'Usage statistics for different routes',
  label: ['route', 'userId', 'orgId', 'email'],
};

export const keyValues = {
  API_KEY: 'apiKey',
  PUSH_INTERVAL: 'pushIntervalMs',
  APP_VERSION: 'appVersion',
  ENABLE_METRIC_COLLECTION: 'enableMetricCollection',
  SERVER_URL: 'serverUrl',
};
