import { Router } from 'express';
import { Container } from 'inversify';
import { AuthMiddleware } from '../../../libs/middlewares/auth.middleware';
import {
  //answerQueryFromKB,
  deleteRecord,
  getRecords,
  unarchiveRecord,
  createRecords,
  // setRecordExpirationTime,
  // getOCRData,
  // searchInKB,
  // uploadNextVersion,
  // restoreRecord,
  archiveRecord,
  getRecordById,
  updateRecord,
} from '../controllers/kb_controllers';
import { ArangoService } from '../../../libs/services/arango.service';
import { metricsMiddleware } from '../../../libs/middlewares/prometheus.middleware';
import { ValidationMiddleware } from '../../../libs/middlewares/validation.middleware';
import {
  createRecordSchema,
  uploadNextVersionSchema,
  getRecordByIdSchema,
  updateRecordSchema,
  deleteRecordSchema,
  archiveRecordSchema,
  unarchiveRecordSchema,
  restoreRecordSchema,
  setRecordExpirationTimeSchema,
  getOCRDataSchema,
  searchInKBSchema,
  answerQueryFromKBSchema,
  getRecordsSchema,
} from '../validators/validators';
import { FileProcessorFactory } from '../../../libs/middlewares/file_processor/fp.factory';
import { FileProcessingType } from '../../../libs/middlewares/file_processor/fp.constant';
import { extensionToMimeType } from '../../storage/mimetypes/mimetypes';
import { RecordRelationService } from '../services/kb.relation.service';
import { KeyValueStoreService } from '../../../libs/services/keyValueStore.service';
import { RecordsEventProducer } from '../services/records_events.service';
import { AppConfig } from '../../tokens_manager/config/config';

export function createKnowledgeBaseRouter(container: Container): Router {
  const router = Router();
  const appConfig = container.get<AppConfig>('AppConfig');
  const arangoService = container.get<ArangoService>('ArangoService');
  const recordsEventProducer = container.get<RecordsEventProducer>(
    'RecordsEventProducer',
  );
  
  const recordRelationService = new RecordRelationService(
    arangoService,
    recordsEventProducer,
    appConfig.storage,
  );
  const keyValueStoreService = container.get<KeyValueStoreService>(
    'KeyValueStoreService',
  );
  const authMiddleware = container.get<AuthMiddleware>('AuthMiddleware');
  // Create new records in the knowledge base
  router.post(
    '/',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ...FileProcessorFactory.createBufferUploadProcessor({
      fieldName: 'files',
      allowedMimeTypes: Object.values(extensionToMimeType),
      maxFilesAllowed: 10,
      isMultipleFilesAllowed: true,
      processingType: FileProcessingType.BUFFER,
      maxFileSize: 1024 * 1024 * 30,
      strictFileUpload: true,
    }).getMiddleware,
    ValidationMiddleware.validate(createRecordSchema),
    createRecords(recordRelationService, keyValueStoreService, appConfig),
  );

  // Get a specific record by ID
  router.get(
    '/:recordId',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ValidationMiddleware.validate(getRecordByIdSchema),
    getRecordById(appConfig),
  );

  // Update an existing record
  router.put(
    '/:recordId',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ...FileProcessorFactory.createBufferUploadProcessor({
      fieldName: 'file',
      allowedMimeTypes: Object.values(extensionToMimeType),
      maxFilesAllowed: 1,
      isMultipleFilesAllowed: false,
      processingType: FileProcessingType.BUFFER,
      maxFileSize: 1024 * 1024 * 30,
      strictFileUpload: false,
    }).getMiddleware,
    ValidationMiddleware.validate(updateRecordSchema),
    updateRecord(
      recordRelationService,
      keyValueStoreService,
      appConfig.storage,
    ),
  );

  // Delete a record by ID
  router.delete(
    '/:recordId',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ValidationMiddleware.validate(deleteRecordSchema),
    deleteRecord(recordRelationService),
  );

  // Get all records
  router.get(
    '/',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ValidationMiddleware.validate(getRecordsSchema),
    getRecords(recordRelationService),
  );

  // Archive a record
  router.patch(
    '/:recordId/archive',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ValidationMiddleware.validate(archiveRecordSchema),
    archiveRecord(recordRelationService, keyValueStoreService),
  );

  // Unarchive a previously archived record
  router.patch(
    '/:recordId/unarchive',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ValidationMiddleware.validate(unarchiveRecordSchema),
    unarchiveRecord(recordRelationService, keyValueStoreService),
  );

  // Restore a deleted record
  router.patch(
    '/:recordId/restore',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ValidationMiddleware.validate(restoreRecordSchema),
    //restoreRecord(arangoService),
  );

  // Set expiration time for a record
  router.post(
    '/:recordId/expiration',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ValidationMiddleware.validate(setRecordExpirationTimeSchema),
    //setRecordExpirationTime(arangoService),
  );

  // Get OCR data for a record
  router.get(
    '/:recordId/ocr',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ValidationMiddleware.validate(getOCRDataSchema),
    //getOCRData(arangoService),
  );

  // Upload a new version of an existing record
  router.post(
    '/:recordId/nextVersion',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ...FileProcessorFactory.createBufferUploadProcessor({
      fieldName: 'file',
      allowedMimeTypes: Object.values(extensionToMimeType),
      maxFilesAllowed: 1,
      isMultipleFilesAllowed: false,
      processingType: FileProcessingType.BUFFER,
      maxFileSize: 1024 * 1024 * 50,
      strictFileUpload: true,
    }).getMiddleware,
    ValidationMiddleware.validate(uploadNextVersionSchema),
    //uploadNextVersion(arangoService),
  );

  // Search within the knowledge base
  router.post(
    '/search',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ValidationMiddleware.validate(searchInKBSchema),
    //searchInKB(arangoService),
  );

  // Answer queries using the knowledge base
  router.post(
    '/query',
    authMiddleware.authenticate,
    metricsMiddleware(container),
    ValidationMiddleware.validate(answerQueryFromKBSchema),
    //answerQueryFromKB(arangoService),
  );

  return router;
}
