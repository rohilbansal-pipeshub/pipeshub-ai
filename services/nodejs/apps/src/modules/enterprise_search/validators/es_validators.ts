// es_schema.ts
import { z } from 'zod';

// Regular expression for MongoDB ObjectId validation
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

/**
 * Schema for creating an enterprise search document.
 * This validates that:
 * - query is provided (nonempty, maximum 100000 characters)
 * - conversationSource is provided and is one of the allowed values
 * - If conversationSource is "records":
 *    - conversationSourceRecordId is required and must be a valid ObjectId
 *    - if recordIds are provided, conversationSourceRecordId must be included in them
 * - If conversationSource is "sales":
 *    - conversationSourceRecordId must NOT be provided
 * - Optionally, recordIds, departments
 *   are arrays of valid ObjectIds.
 */
export const enterpriseSearchCreateSchema = z.object({
  body: z.object({
    query: z
      .string({ required_error: 'Query is required' })
      .min(1, { message: 'Query is required' })
      .max(100000, {
        message: 'Query exceeds maximum length of 100000 characters',
      }),
    recordIds: z
      .array(
        z
          .string()
          .regex(objectIdRegex, { message: 'Invalid record ID format' }),
      )
      .optional(),
    departments: z
      .array(
        z
          .string()
          .regex(objectIdRegex, { message: 'Invalid department ID format' }),
      )
      .optional(),
  }),
});

export const conversationIdParamsSchema = z.object({
  params: z.object({
    conversationId: z
      .string()
      .regex(objectIdRegex, { message: 'Invalid message ID format' }),
  }),
});

export const conversationTitleParamsSchema = conversationIdParamsSchema.extend({
  body: z.object({
    title: z
      .string()
      .min(1, { message: 'Title is required' })
      .max(200, { message: 'Title must be less than 200 characters' }),
  }),
});

export const conversationShareParamsSchema = conversationIdParamsSchema.extend({
  body: z.object({
    userIds: z
      .array(z.string().regex(objectIdRegex))
      .min(1, { message: 'At least one user ID is required' }),
  }),
});

export const addMessageParamsSchema = enterpriseSearchCreateSchema.extend({
  params: z.object({
    conversationId: z.string().regex(objectIdRegex, {
      message: 'Invalid conversation ID format',
    }),
  }),
});

export const messageIdParamsSchema = z.object({
  params: z.object({
    messageId: z
      .string()
      .regex(objectIdRegex, { message: 'Invalid message ID format' }),
  }),
});

export const regenerateAnswersParamsSchema = z.object({
  params: z.object({
    conversationId: z
      .string()
      .regex(objectIdRegex, { message: 'Invalid message ID format' }),
    messageId: z
      .string()
      .regex(objectIdRegex, { message: 'Invalid message ID format' }),
  }),
});

export const updateFeedbackParamsSchema = regenerateAnswersParamsSchema;

/**
 * Schema for getting an enterprise search document by ID.
 */
export const enterpriseSearchGetSchema = z.object({
  params: z.object({
    conversationId: z.string().regex(objectIdRegex, {
      message: 'ID must be a valid MongoDB ObjectId',
    }),
  }),
});

/**
 * Schema for deleting an enterprise search document.
 * (Same as get schema for ID validation.)
 */
export const enterpriseSearchDeleteSchema = enterpriseSearchGetSchema;

/**
 * Schema for searching enterprise search documents.
 * Validates query parameters:
 * - query (required)
 * - page and limit are optional numbers (with defaults)
 * - sortBy and sortOrder are optional and must be one of the allowed values if provided.
 */
export const enterpriseSearchQuerySchema = z.object({
  query: z.object({
    query: z
      .string({ required_error: 'Search query is required' })
      .min(1, { message: 'Search query is required' }),
    page: z.preprocess((arg) => Number(arg), z.number().min(1).default(1)),
    limit: z.preprocess(
      (arg) => Number(arg),
      z.number().min(1).max(100).default(10),
    ),
    sortBy: z.enum(['createdAt', 'title']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

export const enterpriseSearchSearchSchema = z.object({
  body: z.object({
    query: z.string().min(1, { message: 'Search query is required' }),
    limit: z
      .preprocess((arg) => Number(arg), z.number().min(1).max(100).default(10))
      .optional(),
  }),
});

export const enterpriseSearchSearchHistorySchema = z.object({
  params: z.object({
    limit: z
      .preprocess((arg) => Number(arg), z.number().min(1).max(100).default(10))
      .optional(),
    page: z
      .preprocess((arg) => Number(arg), z.number().min(1).default(1))
      .optional(),
  }),
});

export const searchIdParamsSchema = z.object({
  params: z.object({
    searchId: z
      .string()
      .regex(objectIdRegex, { message: 'Invalid search ID format' }),
  }),
});

export const searchShareParamsSchema = searchIdParamsSchema.extend({
  body: z.object({
    userIds: z.array(z.string().regex(objectIdRegex)).min(1, {
      message: 'At least one user ID is required',
    }),
    accessLevel: z.enum(['read', 'write']).optional(),
  }),
});
