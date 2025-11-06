import * as AWS from 'aws-sdk';
import { processSqsMessage } from './handler';
import dotenv from 'dotenv';
import { LocalSqsProcessorConfig, LocalSqsProcessorConfigSchema } from './configSchema';
import getConfig from './utils/configUtil';
dotenv.config();

class LocalSqsProcessor {
  private config: LocalSqsProcessorConfig;
  private sqs: AWS.SQS;
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.config = getConfig();
    this.sqs = new AWS.SQS({
      region: this.config.awsRegion,
    });
  }

  private getQueueInfo(): { queueUrl: string; queueArn: string } {
    const queueUrl = `https://sqs.${this.config.awsRegion}.amazonaws.com/${this.config.awsAccountId}/${this.config.queueName}`;
    const queueArn = `arn:aws:sqs:${this.config.awsRegion}:${this.config.awsAccountId}:${this.config.queueName}`;

    return { queueUrl, queueArn };
  }

  private async deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    try {
      await this.sqs
        .deleteMessage({
          QueueUrl: queueUrl,
          ReceiptHandle: receiptHandle,
        })
        .promise();
    } catch (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  }

  async pollAndProcess(): Promise<void> {
    try {
      console.log(`\n[${new Date().toISOString()}] Polling SQS queue: ${this.config.queueName}`);

      const { queueUrl, queueArn } = this.getQueueInfo();

      const receiveParams: AWS.SQS.ReceiveMessageRequest = {
        QueueUrl: queueUrl,
        MaxNumberOfMessages: this.config.maxMessages,
        WaitTimeSeconds: 20, // Long polling
        MessageAttributeNames: ['All'],
        AttributeNames: ['All'],
      };

      const { Messages } = await this.sqs.receiveMessage(receiveParams).promise();

      if (!Messages || Messages.length === 0) {
        console.log('No messages available');
        return;
      }

      console.log(`Received ${Messages.length} message(s)`);

      const event: any = {
        Records: Messages.map((message: AWS.SQS.Message) => ({
          messageId: message.MessageId || '',
          receiptHandle: message.ReceiptHandle || '',
          body: message.Body || '',
          attributes: message.Attributes || {},
          messageAttributes: message.MessageAttributes || {},
          md5OfBody: message.MD5OfBody || '',
          eventSource: 'aws:sqs',
          eventSourceARN: queueArn,
          awsRegion: this.config.awsRegion,
        })),
      };

      console.log('Invoking Lambda handler...');
      await processSqsMessage(event);

      for (const message of Messages) {
        if (message.ReceiptHandle) {
          await this.deleteMessage(queueUrl, message.ReceiptHandle);
          console.log(`Deleted message: ${message.MessageId}`);
        }
      }

      console.log(`Processed ${Messages.length} message(s) successfully`);
    } catch (error) {
      console.error('Error in pollAndProcess:', error);
      throw error;
    }
  }

  async start(): Promise<void> {
    console.log('=== Local SQS Message Processor ===');
    console.log(`Queue Name: ${this.config.queueName}`);
    console.log(`Region: ${this.config.awsRegion}`);
    console.log(`AWS Account ID: ${this.config.awsAccountId}`);
    console.log(`Poll Interval: ${this.config.pollInterval}ms`);
    console.log(`Max Messages per Poll: ${this.config.maxMessages}`);
    console.log('\nPress Ctrl+C to stop\n');

    await this.pollAndProcess();

    this.intervalId = setInterval(async () => {
      await this.pollAndProcess();
    }, this.config.pollInterval);

    process.on('SIGINT', () => {
      this.stop();
    });

    process.on('SIGTERM', () => {
      this.stop();
    });
  }

  stop(): void {
    if (this.intervalId) {
      console.log('\n\nShutting down...');
      clearInterval(this.intervalId);
      this.intervalId = null;
      process.exit(0);
    }
  }
}

async function main(): Promise<void> {
  try {
    const processor = new LocalSqsProcessor();
    await processor.start();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
