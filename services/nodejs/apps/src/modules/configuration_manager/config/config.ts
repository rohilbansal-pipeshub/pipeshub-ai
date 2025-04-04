import { StoreType } from '../../../libs/keyValueStore/constants/KeyValueStoreType';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Logger } from '../../../libs/services/logger.service';

const logger = Logger.getInstance({ service: 'ConfigurationManagerConfig' });

export interface ConfigurationManagerStoreConfig {
  host: string;
  port: number;
  dialTimeout: number;
}
export interface ConfigurationManagerConfig {
  storeType: string;
  storeConfig: ConfigurationManagerStoreConfig;
  secretKey: string;
  algorithm: string;
}

export const generateAndStoreSecretKey = (): string => {
  // Generate a random 32-byte hex string
  const secretKey = crypto.randomBytes(32).toString('hex');

  // Determine the path to the .env file
  const envFilePath = path.resolve(process.cwd(), '.env');

  let envConfig: Record<string, string> = {};

  // Check if .env file exists
  if (fs.existsSync(envFilePath)) {
    // Parse existing .env file
    const existingEnv = dotenv.parse(fs.readFileSync(envFilePath));
    envConfig = { ...existingEnv };
  }

  // Set or update the SECRET_KEY
  envConfig.SECRET_KEY = secretKey;

  // Convert config object to .env format string
  const envString = Object.entries(envConfig)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // Write to .env file
  fs.writeFileSync(envFilePath, envString);

  // Also set in current process environment for immediate use
  process.env.SECRET_KEY = secretKey;

  logger.debug('Secret key generated and stored in .env file');

  return secretKey;
};

export const loadConfigurationManagerConfig =
  (): ConfigurationManagerConfig => {
    return {
      storeType: process.env.STORE_TYPE! || StoreType.Etcd3,
      storeConfig: {
        host: process.env.ETCD_HOST! || 'http://localhost',
        port: parseInt(process.env.STORE_PORT!, 10) || 2379,
        dialTimeout: parseInt(process.env.STORE_DIAL_TIMEOUT!, 10) || 2000,
      },
      secretKey: process.env.SECRET_KEY! || generateAndStoreSecretKey(),
      algorithm: process.env.ALGORITHM! || 'aes-256-gcm',
    };
  };
