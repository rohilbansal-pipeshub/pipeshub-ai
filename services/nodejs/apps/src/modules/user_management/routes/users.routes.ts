import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Container } from 'inversify';
import { ValidationMiddleware } from '../../../libs/middlewares/validation.middleware';
import { AuthMiddleware } from '../../../libs/middlewares/auth.middleware';
import { userExists } from '../middlewares/userExists';
import { userAdminCheck } from '../middlewares/userAdminCheck';
import { userAdminOrSelfCheck } from '../middlewares/userAdminOrSelfCheck';
// import { attachContainerMiddleware } from '../../auth/middlewares/attachContainer.middleware';
import { accountTypeCheck } from '../middlewares/accountTypeCheck';
import { smtpConfigCheck } from '../middlewares/smtpConfigCheck';
import { AuthenticatedUserRequest } from '../../../libs/middlewares/types';
import { UserController } from '../controller/users.controller';
import { metricsMiddleware } from '../../../libs/middlewares/prometheus.middleware';
import { PrometheusService } from '../../../libs/services/prometheus/prometheus.service';
import { TokenScopes } from '../../../libs/enums/token-scopes.enum';
import { FileProcessorFactory } from '../../../libs/middlewares/file_processor/fp.factory';
import { FileProcessingType } from '../../../libs/middlewares/file_processor/fp.constant';
import { AppConfig } from '../../tokens_manager/config/config';

const UserIdUrlParams = z.object({
  id: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid UserId'),
});

const UserIdValidationSchema = z.object({
  body: z.object({}),
  query: z.object({}),
  params: UserIdUrlParams,
  headers: z.object({}),
});
const MultipleUserBody = z.object({
  userIds: z
    .array(z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid MongoDB ObjectId'))
    .min(1, 'At least one userId is required'),
});
const MultipleUserValidationSchema = z.object({
  body: MultipleUserBody,
  query: z.object({}),
  params: z.object({}),
  headers: z.object({}),
});
const createUserBody = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  email: z.string().email('Invalid email'),
  mobile: z
    .string()
    .optional()
    .refine((val) => !val || /^\+?[0-9]{10,15}$/.test(val), {
      message: 'Invalid mobile number',
    }),
  designation: z.string().optional(),
});
const updateUserBody = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  email: z.string().email('Invalid email'),
  mobile: z
    .string()
    .optional()
    .refine((val) => !val || /^\+?[0-9]{10,15}$/.test(val), {
      message: 'Invalid mobile number',
    }),
  designation: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  address: z
    .object({
      addressLine1: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postCode: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
  hasLoggedIn: z.boolean().optional(),
});

const createUserValidationSchema = z.object({
  body: createUserBody,
  query: z.object({}),
  params: z.object({}),
  headers: z.object({}),
});

const updateFullNameBody = z.object({
  fullName: z.string().min(1, 'fullName is required'),
});

const updateFirstNameBody = z.object({
  firstName: z.string().min(1, 'firstName is required'),
});

const updateLastNameBody = z.object({
  lastName: z.string().min(1, 'lastName is required'),
});

const updateEmailBody = z.object({
  email: z.string().email('Valid email is required'),
});

const updateUserFullNameValidationSchema = z.object({
  body: updateFullNameBody,
  query: z.object({}),
  params: UserIdUrlParams,
  headers: z.object({}),
});
const updateUserFirstNameValidationSchema = z.object({
  body: updateFirstNameBody,
  query: z.object({}),
  params: UserIdUrlParams,
  headers: z.object({}),
});
const updateUserLastNameValidationSchema = z.object({
  body: updateLastNameBody,
  query: z.object({}),
  params: UserIdUrlParams,
  headers: z.object({}),
});

const updateDesignationBody = z.object({
  designation: z.string().min(1, 'designation is required'),
});

const updateUserDesignationValidationSchema = z.object({
  body: updateDesignationBody,
  query: z.object({}),
  params: UserIdUrlParams,
  headers: z.object({}),
});

const updateUserEmailValidationSchema = z.object({
  body: updateEmailBody,
  query: z.object({}),
  params: UserIdUrlParams,
  headers: z.object({}),
});

const updateUserValidationSchema = z.object({
  body: updateUserBody,
  query: z.object({}),
  params: UserIdUrlParams,
  headers: z.object({}),
});
const emailIdValidationSchema = z.object({
  body: updateEmailBody,
  query: z.object({}),
  params: z.object({}),
  headers: z.object({}),
});

export function createUserRouter(container: Container) {
  const router = Router();
  const userController = container.get<UserController>('UserController');
  const authMiddleware = container.get<AuthMiddleware>('AuthMiddleware');
  const prometheusService = container.get<PrometheusService>(PrometheusService);
  const config = container.get<AppConfig>('AppConfig');
  // Todo: Apply Rate Limiter Middleware
  // Todo: Apply Validation Middleware
  // Routes

  router.get(
    '/',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await userController.getAllUsers(req, res);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/fetch/with-groups',
    authMiddleware.authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await userController.getAllUsersWithGroups(req, res);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/:id',
    authMiddleware.authenticate,
    ValidationMiddleware.validate(UserIdValidationSchema),
    metricsMiddleware(container),
    userExists,
    async (
      req: AuthenticatedUserRequest,
      res: Response,
      next: NextFunction,
    ) => {
      try {
        await userController.getUserById(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    '/by-ids',
    authMiddleware.authenticate,
    ValidationMiddleware.validate(MultipleUserValidationSchema),
    metricsMiddleware(container),
    async (
      req: AuthenticatedUserRequest,
      res: Response,
      next: NextFunction,
    ) => {
      try {
        await userController.getUsersByIds(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/email/exists',
    metricsMiddleware(container),
    authMiddleware.scopedTokenValidator(TokenScopes.USER_LOOKUP),
    ValidationMiddleware.validate(emailIdValidationSchema),
    async (
      req: AuthenticatedUserRequest,
      res: Response,
      next: NextFunction,
    ) => {
      try {
        await userController.checkUserExistsByEmail(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    '/internal/:id',
    authMiddleware.scopedTokenValidator(TokenScopes.USER_LOOKUP),
    ValidationMiddleware.validate(UserIdValidationSchema),
    metricsMiddleware(container),
    userExists,
    async (
      req: AuthenticatedUserRequest,
      res: Response,
      next: NextFunction,
    ) => {
      try {
        await userController.getUserById(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ValidationMiddleware.validate(createUserValidationSchema),
    userAdminCheck,
    async (
      req: AuthenticatedUserRequest,
      res: Response,
      next: NextFunction,
    ) => {
      try {
        await userController.createUser(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    '/:id/fullname',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ValidationMiddleware.validate(updateUserFullNameValidationSchema),
    userAdminOrSelfCheck,
    userExists,
    async (
      req: AuthenticatedUserRequest,
      res: Response,
      next: NextFunction,
    ) => {
      try {
        await userController.updateFullName(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    '/:id/firstName',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ValidationMiddleware.validate(updateUserFirstNameValidationSchema),
    userAdminOrSelfCheck,
    userExists,
    async (
      req: AuthenticatedUserRequest,
      res: Response,
      next: NextFunction,
    ) => {
      try {
        await userController.updateFirstName(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    '/:id/lastName',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ValidationMiddleware.validate(updateUserLastNameValidationSchema),
    userAdminOrSelfCheck,
    userExists,
    async (
      req: AuthenticatedUserRequest,
      res: Response,
      next: NextFunction,
    ) => {
      try {
        await userController.updateLastName(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    '/dp',
    authMiddleware.authenticate,
    ...FileProcessorFactory.createBufferUploadProcessor({
      fieldName: 'file',
      allowedMimeTypes: [
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/webp',
        'image/gif',
      ],
      maxFilesAllowed: 1,
      isMultipleFilesAllowed: false,
      processingType: FileProcessingType.BUFFER,
      maxFileSize: 1024 * 1024,
      strictFileUpload: true,
    }).getMiddleware,
    metricsMiddleware(container),
    async (
      req: AuthenticatedUserRequest,
      res: Response,
      next: NextFunction,
    ) => {
      try {
        await userController.updateUserDisplayPicture(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    '/dp',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    async (
      req: AuthenticatedUserRequest,
      res: Response,
      next: NextFunction,
    ) => {
      try {
        await userController.removeUserDisplayPicture(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/dp',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    async (
      req: AuthenticatedUserRequest,
      res: Response,
      next: NextFunction,
    ) => {
      try {
        await userController.getUserDisplayPicture(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    '/:id/designation',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ValidationMiddleware.validate(updateUserDesignationValidationSchema),
    userAdminOrSelfCheck,
    userExists,
    async (
      req: AuthenticatedUserRequest,
      res: Response,
      next: NextFunction,
    ) => {
      try {
        await userController.updateDesignation(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    '/:id/email',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ValidationMiddleware.validate(updateUserEmailValidationSchema),
    userAdminOrSelfCheck,
    userExists,
    async (
      req: AuthenticatedUserRequest,
      res: Response,
      next: NextFunction,
    ) => {
      try {
        await userController.updateEmail(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    '/:id',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ValidationMiddleware.validate(updateUserValidationSchema),
    userAdminOrSelfCheck,
    userExists,
    async (
      req: AuthenticatedUserRequest,
      res: Response,
      next: NextFunction,
    ) => {
      try {
        await userController.updateUser(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    '/:id',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ValidationMiddleware.validate(UserIdValidationSchema),
    userAdminCheck,
    userExists,
    async (
      req: AuthenticatedUserRequest,
      res: Response,
      next: NextFunction,
    ) => {
      try {
        await userController.deleteUser(req, res, next);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/:id/adminCheck',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ValidationMiddleware.validate(UserIdValidationSchema),
    userAdminCheck,
    async (
      _req: AuthenticatedUserRequest,
      res: Response,
      next: NextFunction,
    ) => {
      try {
        res.status(200).json({ message: 'User has admin access' });
        return;
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/bulk/invite',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    smtpConfigCheck(config.cmBackend),
    userAdminCheck,
    accountTypeCheck,
    // attachContainerMiddleware(container),
    async (
      req: AuthenticatedUserRequest,
      res: Response,
      next: NextFunction,
    ) => {
      try {
        await userController.addManyUsers(req, res, next, prometheusService);
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    '/:id/resend-invite',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ValidationMiddleware.validate(UserIdValidationSchema),
    smtpConfigCheck(config.cmBackend),
    userAdminCheck,
    accountTypeCheck,
    // attachContainerMiddleware(container),
    async (
      req: AuthenticatedUserRequest,
      res: Response,
      next: NextFunction,
    ) => {
      try {
        await userController.resendInvite(req, res, next, prometheusService);
      } catch (error) {
        next(error);
      }
    },
  );

  // Health check endpoint
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
