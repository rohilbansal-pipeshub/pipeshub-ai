import { Container } from 'inversify';
import { Logger } from '../../../libs/services/logger.service';
import { MailController } from '../controller/mail.controller';
import { AuthTokenService } from '../../../libs/services/authtoken.service';
import { AuthMiddleware } from '../../../libs/middlewares/auth.middleware';
import { AppConfig } from '../../tokens_manager/config/config';

export class MailServiceContainer {
  private static instance: Container;
  static async initialize(appConfig: AppConfig): Promise<Container> {
    const container = new Container();
    container.bind<Logger>('Logger').toConstantValue(new Logger());
    container
      .bind<AppConfig>('AppConfig')
      .toDynamicValue(() => appConfig) // Always fetch latest reference
      .inSingletonScope();
    // Initialize and bind services
    await this.initializeServices(container, appConfig);

    this.instance = container;
    return container;
  }

  private static async initializeServices(
    container: Container,
    appConfig: AppConfig,
  ): Promise<void> {
    try {
      if (container.isBound('MailController')) {
        container.unbind('MailController'); // Unbind safely before rebinding
      }

      container.bind<MailController>('MailController').toDynamicValue(() => {
        return new MailController(appConfig, container.get('Logger'));
      });
      const jwtSecret = appConfig.jwtSecret;
      const scopedJwtSecret = appConfig.scopedJwtSecret;
      const authTokenService = new AuthTokenService(jwtSecret, scopedJwtSecret);
      const authMiddleware = new AuthMiddleware(
        container.get('Logger'),
        authTokenService,
      );
      container
        .bind<AuthMiddleware>('AuthMiddleware')
        .toConstantValue(authMiddleware);
    } catch (error) {
      const logger = container.get<Logger>('Logger');
      logger.error('Failed to initialize services', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  static getInstance(): Container {
    if (!this.instance) {
      throw new Error('Mail Service container not initialized');
    }
    return this.instance;
  }

  static async dispose(): Promise<void> {
    if (this.instance) {
      const services = this.instance.getAll<any>('Service');
      for (const service of services) {
        if (typeof service.disconnect === 'function') {
          await service.disconnect();
        }
      }
      this.instance = null!;
    }
  }
}
