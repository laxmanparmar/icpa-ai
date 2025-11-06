import z from "zod";

export const LocalSqsProcessorConfigSchema = z.object({
    queueName: z
      .string()
      .min(1, 'Queue name is required')
      .trim(),
    awsRegion: z
      .string()
      .min(1, 'AWS region is required')
      .trim(),
    awsAccountId: z
      .string()
      .regex(/^\d{12}$/, 'AWS Account ID must be exactly 12 digits')
      .min(1, 'AWS Account ID is required'),
    pollInterval: z
      .number()
      .int('Poll interval must be an integer')
      .positive('Poll interval must be greater than 0'),
    maxMessages: z
      .number()
      .int('Max messages must be an integer')
      .min(1, 'Max messages must be at least 1')
      .max(10, 'Max messages cannot exceed 10'),
      s3BucketName: z
      .string(),
      openAIApiKey: z
      .string(),
      qdrantUrl: z
      .string(),
      qdrantApiKey: z
      .string(),
      qdrantCollectionName: z
      .string()
  });
  
 
export type LocalSqsProcessorConfig = z.infer<typeof LocalSqsProcessorConfigSchema>;
  