import * as promClient from 'prom-client';
import { inject, injectable } from 'inversify';
import { Logger } from '../logger.service';
import axios from 'axios';
import { KeyValueStoreService } from '../keyValueStore.service';
import {
  activeUsersFields,
  apiCallCounterFields,
  keyValues,
  routeUsageFields,
  userActivityFields,
} from './constants';
import { etcdPath } from './paths';
import { parseBoolean } from '../../../modules/storage/utils/utils';

const logger = Logger.getInstance({
  service: 'Prometheus Service',
});

@injectable()
export class PrometheusService {
  private register!: promClient.Registry;
  private static instance: PrometheusService;
  private static defaultMetricHost =
    'https://metrics-collector.intellysense.com/collect-metrics';
  private static defaultPushInterval = 50000; //ms
  private apiCallCounter!: promClient.Counter;
  private activeUsers!: promClient.Gauge;
  private userActivityCounter!: promClient.Counter;
  private routeUsageCounter!: promClient.Counter;
  // Read configuration - use environment variables with defaults
  private apiKey!: string;
  private metricsServerUrl!: string;
  private instanceId!: string;
  private appVersion!: string;
  private pushIntervalMs!: number;
  private enableMetricCollection!: boolean;
  private pushInterval: NodeJS.Timeout | null = null;

  constructor(
    @inject('KeyValueStoreService') private kvStore: KeyValueStoreService,
  ) {
    if (PrometheusService.instance) {
      return PrometheusService.instance;
    }
    logger.debug('PrometheusService initialized successfully');
    this.register = new promClient.Registry();

    this.apiCallCounter = new promClient.Counter({
      name: apiCallCounterFields.fieldName,
      help: apiCallCounterFields.description,
      labelNames: apiCallCounterFields.label,
    });

    this.activeUsers = new promClient.Gauge({
      name: activeUsersFields.fieldName,
      help: activeUsersFields.description,
      labelNames: activeUsersFields.label,
    });

    this.userActivityCounter = new promClient.Counter({
      name: userActivityFields.fieldName,
      help: userActivityFields.description,
      labelNames: userActivityFields.label,
    });

    this.routeUsageCounter = new promClient.Counter({
      name: routeUsageFields.fieldName,
      help: routeUsageFields.description,
      labelNames: routeUsageFields.label,
    });

    // Read configuration - use environment variables with defaults
    this.initAndStartMetricsCollection();

    // Register metrics
    this.register.registerMetric(this.apiCallCounter);
    this.register.registerMetric(this.activeUsers);
    this.register.registerMetric(this.userActivityCounter);
    this.register.registerMetric(this.routeUsageCounter);

    // add watch for enable metric collection field
    this.watchKeysForMetricsCollection(etcdPath);

    PrometheusService.instance = this;
  }

  async initAndStartMetricsCollection() {
    try {
      const metricsServer = await this.getOrSet(
        keyValues.SERVER_URL,
        PrometheusService.defaultMetricHost,
      );
      // metric server ulr
      this.metricsServerUrl =
        metricsServer != null
          ? metricsServer
          : process.env.METRICS_SERVER_URL ||
            PrometheusService.defaultMetricHost;
      // api key
      this.apiKey = await this.getOrSet(
        keyValues.API_KEY,
        this.generateInstanceId(),
      );
      // random instance id to separate out different user on server
      this.instanceId = this.generateInstanceId();
      // api version
      this.appVersion = await this.getOrSet(keyValues.APP_VERSION, '1.0.0');
      // interval in ms to push metrics
      this.pushIntervalMs = parseInt(
        await this.getOrSet(
          keyValues.PUSH_INTERVAL,
          String(PrometheusService.defaultPushInterval),
        ),
        10,
      );
      this.enableMetricCollection = parseBoolean(
        await this.getOrSet(keyValues.ENABLE_METRIC_COLLECTION, 'true'),
      );

      logger.debug('The Prometheus Configuration:', {
        metricsServerUrl: this.metricsServerUrl,
        apiKey: this.apiKey,
        instanceId: this.instanceId,
        appVersion: this.appVersion,
        pushIntervalMs: this.pushIntervalMs,
        enableMetricCollection: this.enableMetricCollection,
      });

      await this.startOrStopMetricCollection();
    } catch (error) {
      // If fetching from the key-value store fails, use the fallback
      this.metricsServerUrl =
        process.env.METRICS_SERVER_URL || PrometheusService.defaultMetricHost;
      logger.error('Failed to get metrics server URL from KV store:', error);
    }
  }

  watchKeysForMetricsCollection(key: string) {
    this.kvStore.watchKey(key, this.initAndStartMetricsCollection.bind(this));
  }

  async startOrStopMetricCollection() {
    const etcdValue = JSON.parse(
      (await this.kvStore.get<string>(etcdPath)) || '{}',
    );
    const currentValue = parseBoolean(etcdValue.enableMetricCollection);

    if (currentValue === true) {
      logger.debug('Flag is TRUE - Starting metrics push');
      this.startMetricsPush();
    } else if (currentValue === false) {
      logger.debug('Flag is FALSE - Stopping metrics push');
      this.stopMetricsPush();
    }
  }

  async getOrSet(key: string, value: string): Promise<string> {
    const etcdValue = JSON.parse(
      (await this.kvStore.get<string>(etcdPath)) || '{}',
    );
    if (!(key in etcdValue)) {
      etcdValue[key] = value; // Add the key-value pair while keeping others intact
      await this.kvStore.set<string>(etcdPath, JSON.stringify(etcdValue)); // Save back to store
      return value;
    }

    return etcdValue[key];
  }

  /**
   * Start pushing metrics to central server
   */
  startMetricsPush(): void {
    this.stopMetricsPush();
    // Add a small delay to ensure previous interval is fully cleared
    setTimeout(() => {
      logger.debug(
        'Starting to push metrics to server every',
        this.pushIntervalMs,
      );

      // Store the interval ID and log it for debugging
      this.pushInterval = setInterval(() => {
        logger.debug('Pushing metrics with interval ID:', this.pushInterval);
        this.pushMetricsToServer().catch((err) => {
          logger.error('Failed to push metrics:', err);
        });
      }, this.pushIntervalMs);

      logger.debug('Created new interval with ID:', this.pushInterval);
    }, 200);
  }

  /**
   * Stop pushing metrics
   */
  stopMetricsPush(): void {
    logger.debug(
      'Attempting to stop metrics push - Current interval ID:',
      this.pushInterval,
    );

    // Force clear any interval that might exist
    if (this.pushInterval !== null) {
      clearInterval(this.pushInterval);
      this.pushInterval = null;

      // Double-check that we've actually stopped
      setTimeout(() => {
        if (this.pushInterval === null) {
          logger.debug('Metrics push successfully stopped');
        } else {
          logger.error('Failed to stop metrics push - interval still exists');
        }
      }, 100);
    } else {
      logger.debug('No active push interval to stop (null reference)');
    }

    // Safety measure: Check for any global intervals that might be running
    // This is a debugging step to identify potential issues
    const globalIntervals = Object.keys(global).filter(
      (key) => key.includes('Timeout') || key.includes('Interval'),
    );
    logger.debug('Current global timers:', globalIntervals.length);
  }

  /**
   * Push metrics to your company's server
   */
  async pushMetricsToServer(): Promise<void> {
    try {
      // Get metrics as string
      const metricsText = await this.register.metrics();

      // Create axios instance with specific SSL configuration
      const https = require('https');
      const httpsAgent = new https.Agent({
        rejectUnauthorized: true, // Set to false only for testing if you're having certificate validation issues
        minVersion: 'TLSv1.2', // Specify minimum TLS version
        maxVersion: 'TLSv1.3', // Specify maximum TLS version
        ciphers:
          'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384',
        honorCipherOrder: true,
      });

      // Send to your server with enhanced configuration
      await axios.post(
        this.metricsServerUrl,
        {
          metrics: metricsText,
          instanceId: this.instanceId,
          version: this.appVersion,
          timestamp: new Date().toISOString(),
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 10000, // 10 second timeout
          httpsAgent,
          maxContentLength: Infinity, // For large metric sets
          maxBodyLength: Infinity,
          decompress: true,
        },
      );

      logger.debug('Successfully pushed metrics to server');
    } catch (error: any) {
      // Enhanced error logging
      if (error.response) {
        // The server responded with a status code outside the 2xx range
        logger.error('Error pushing metrics - Server responded with error:', {
          status: error.response.status,
          headers: error.response.headers,
          data: error.response.data,
        });
      } else if (error.request) {
        // The request was made but no response was received
        logger.error('Error pushing metrics - No response received:', {
          request: error.request._currentUrl || error.request.path,
          error: error.message,
        });
        if (error.cause) {
          logger.error('Error cause details:', error.cause);
        }
      } else {
        // Something happened in setting up the request
        logger.error('Error pushing metrics - Request setup error:', {
          message: error.message,
          stack: error.stack,
        });
      }
    }
  }

  /**
   * Generate a unique instance ID (without PII)
   */
  private generateInstanceId(): string {
    const crypto = require('crypto');
    // Generate a hash of hostname or another unique identifier
    // that doesn't contain personal information
    const hash = crypto
      .createHash('sha256')
      .update(process.env.HOSTNAME || Math.random().toString())
      .digest('hex');
    return hash.substring(0, 16); // Use first 16 chars of hash
  }

  /**
   * Get metrics data for Prometheus scraping
   */
  getMetrics(): Promise<string> {
    return this.register.metrics();
  }

  /**
   * Increment API call counter
   */
  incrementApiCall(
    method: string,
    endpoint: string,
    userId?: string,
    orgId?: string,
    email?: string,
  ): void {
    this.apiCallCounter.inc({
      method,
      endpoint,
      userId: userId || 'anonymous',
      orgId: orgId || 'anonymous',
      email,
    });
  }

  /**
   * Record user login (increment active users)
   */
  recordUserLogin(userType: string, email: string): void {
    this.activeUsers.inc({ userType, email });
  }

  /**
   * Record user logout (decrement active users)
   */
  recordUserLogout(userType: string, email: string): void {
    this.activeUsers.dec({ userType, email });
  }

  /**
   * Record user activity
   */
  recordUserActivity(
    activity: string,
    userId?: string,
    orgId?: string,
    email?: string,
  ): void {
    this.userActivityCounter.inc({
      activity,
      userId: userId || 'anonymous',
      orgId: orgId || 'anonymous',
      email,
    });
  }

  /**
   * Record Org activity
   */
  recordOrgActivity(activity: string, email: string, orgId: string): void {
    this.userActivityCounter.inc({
      activity,
      email: email || 'anonymous',
      orgId: orgId || 'anonymous',
    });
  }

  /**
   * Record route usage
   */
  recordRouteUsage(
    route: string,
    userId?: string,
    orgId?: string,
    email?: string,
  ): void {
    this.routeUsageCounter.inc({
      route,
      userId: userId || 'anonymous',
      orgId: orgId || 'anonymous',
      email: email || 'anonymous',
    });
  }

  /**
   * Set the current number of active users directly
   */
  setActiveUserCount(userType: string, email: string, count: number): void {
    this.activeUsers.set({ userType, email }, count);
  }

  /**
   * Create and register a custom metric
   */
  createCustomMetric<T extends promClient.Metric<any>>(
    metricType: new (...args: any[]) => T,
    config: promClient.MetricConfiguration<any>,
  ): T {
    const metric = new metricType(config);
    this.register.registerMetric(metric);
    return metric;
  }
}
