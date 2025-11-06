import dotenv from 'dotenv';
import { LocalSqsProcessorConfigSchema } from '../configSchema';
dotenv.config();

const getConfig = () => {
    const rawConfig = {
        queueName: process.env.SQS_QUEUE_NAME,
        awsRegion: process.env.AWS_REGION,
        awsAccountId: process.env.AWS_ACCOUNT_ID || '',
        pollInterval: process.env.POLL_INTERVAL ? parseInt(process.env.POLL_INTERVAL, 10) : 5000,
        maxMessages: process.env.MAX_MESSAGES ? parseInt(process.env.MAX_MESSAGES, 10) : 10,
        s3BucketName: process.env.S3_BUCKET_NAME,
        openAIApiKey: process.env.OPENAI_API_KEY,
        qdrantUrl: process.env.QDRANT_URL,
        qdrantApiKey: process.env.QDRANT_API_KEY,
        qdrantCollectionName: process.env.QDRANT_COLLECTION_NAME,
      };
  
      const result = LocalSqsProcessorConfigSchema.safeParse(rawConfig);
      if (!result.success) {
        const errors = result.error.errors.map(err => {
          const path = err.path.join('.');
          return `  - ${path}: ${err.message}`;
        }).join('\n');
        
        throw new Error(`Configuration validation failed:\n${errors}`);
      }
  
      return result.data;
}

export default getConfig;