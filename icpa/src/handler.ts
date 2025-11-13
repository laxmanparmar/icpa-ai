import { SQSEvent, SQSRecord, Context, SQSBatchResponse } from 'aws-lambda';
import { processClaimChain } from './handler/index';
import getConfig from './utils/configUtil';

async function processRecord(record: SQSRecord): Promise<void> {
  try {
    console.log('Processing SQS record:', {
      messageId: record.messageId
    });

    const snsMessage = JSON.parse(record.body);
    

    if (snsMessage.Type === 'Notification') {
      const message = JSON.parse(snsMessage.Message);
      
      console.log('SNS Message received:', {
        subject: snsMessage.Subject,
        topicArn: snsMessage.TopicArn,
        messageId: snsMessage.MessageId,
        timestamp: snsMessage.Timestamp,
        messageData: message,
      });

      await processBusinessLogic(message);
    } else {
      await processBusinessLogic(snsMessage);
    }
  } catch (error) {
    console.error('Error processing record:', error);
    throw error;
  }
}

async function processBusinessLogic(message: any): Promise<void> {
  console.log('Processing business logic for message:', message);
  
  const userId = message.userId || message.user_id;
  
  if (!userId) {
    throw new Error('userId is required in the message');
  }
  const {
    s3BucketName,
    openAIApiKey,
    awsRegion,
    qdrantUrl,
    qdrantApiKey,
    qdrantCollectionName,
  } = getConfig();

  console.log(`Starting claim processing chain for userId: ${userId}`);

  await processClaimChain(
    userId,
    s3BucketName,
    openAIApiKey,
    awsRegion,
    qdrantUrl,
    qdrantApiKey,
    qdrantCollectionName
  );

  console.log('Business logic completed successfully');
}

export const processSqsMessage = async (
  event: SQSEvent
): Promise<SQSBatchResponse | void> => {
  console.log('SQS Event received:');

  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      await processRecord(record);
    } catch (error) {
      console.error(`Failed to process record ${record.messageId}:`, error);
      
      batchItemFailures.push({
        itemIdentifier: record.messageId,
      });
    }
  }

  if (batchItemFailures.length > 0) {
    console.warn(`Failed to process ${batchItemFailures.length} out of ${event.Records.length} records`);
    return {
      batchItemFailures,
    };
  }

  console.log(`Successfully processed all ${event.Records.length} records`);
};

