import { SQSEvent, SQSRecord, Context, SQSBatchResponse } from 'aws-lambda';
import { processClaimChain } from './handler/index';
import getConfig from './utils/configUtil';

async function processRecord(record: SQSRecord): Promise<void> {
  try {
    console.log('Processing SQS record:', {
      messageId: record.messageId
    });

    // Parse the SQS message body (which contains the SNS message)
    const snsMessage = JSON.parse(record.body);
    
    // Extract the actual message from SNS
    // SNS wraps messages in a specific format when delivered to SQS
    if (snsMessage.Type === 'Notification') {
      const message = JSON.parse(snsMessage.Message);
      
      console.log('SNS Message received:', {
        subject: snsMessage.Subject,
        topicArn: snsMessage.TopicArn,
        messageId: snsMessage.MessageId,
        timestamp: snsMessage.Timestamp,
        messageData: message,
      });

      // Process your business logic here
      await processBusinessLogic(message);
    } else {
      await processBusinessLogic(snsMessage);
    }
  } catch (error) {
    console.error('Error processing record:', error);
    throw error; // Re-throw to trigger retry or DLQ
  }
}

/**
 * Business logic to process the actual message
 * Executes the complete claim processing chain:
 * 1. Pull data from S3
 * 2. Process images
 * 3. Process PDFs
 * 4. Retrieve policies from Qdrant
 * 5. Evaluate claim with deterministic LLM
 */
async function processBusinessLogic(message: any): Promise<void> {
  console.log('Processing business logic for message:', message);
  
  // Extract userId from message
  // Expected message format: { userId: string, bucketName?: string }
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

  const result = await processClaimChain(
    userId,
    s3BucketName,
    openAIApiKey,
    awsRegion,
    qdrantUrl,
    qdrantApiKey,
    qdrantCollectionName
  );

  // Log results
  // console.log('Claim processing chain completed:', {
  //   userId: result.userId
  // });

  // console.log('Final claim evaluation:', {
  //   decision: result.step5_claimEvaluation.decision,
  //   confidence: result.step5_claimEvaluation.confidence,
  //   reasoning: result.step5_claimEvaluation.reasoning,
  //   keyFactors: result.step5_claimEvaluation.keyFactors,
  //   policyReferences: result.step5_claimEvaluation.policyReferences,
  // });

  // if (result.errors.length > 0) {
  //   console.warn('Errors encountered during processing:', result.errors);
  // }

  console.log('Business logic completed successfully');
}

export const processSqsMessage = async (
  event: SQSEvent
): Promise<SQSBatchResponse | void> => {
  console.log('SQS Event received:');

  const batchItemFailures: { itemIdentifier: string }[] = [];

  // Process each record
  for (const record of event.Records) {
    try {
      await processRecord(record);
    } catch (error) {
      console.error(`Failed to process record ${record.messageId}:`, error);
      
      // Add to batch failures for partial batch failure reporting
      // This allows successful messages to be processed while failed ones are retried
      batchItemFailures.push({
        itemIdentifier: record.messageId,
      });
    }
  }

  // Return batch failures if any (for partial batch failure reporting)
  // This is only supported for FIFO queues or when using Lambda event source mapping v2
  if (batchItemFailures.length > 0) {
    console.warn(`Failed to process ${batchItemFailures.length} out of ${event.Records.length} records`);
    return {
      batchItemFailures,
    };
  }

  console.log(`Successfully processed all ${event.Records.length} records`);
};

