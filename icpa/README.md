# ICPA SNS-SQS-Lambda Service

An event-driven serverless service that processes messages from SNS via SQS using AWS Lambda.

## Architecture

```
SNS Topic → SQS Queue → Lambda Function
```

- **SNS Topic**: Publishes messages
- **SQS Queue**: Receives messages from SNS and triggers Lambda
- **Lambda Function**: Processes messages from SQS
- **Dead Letter Queue**: Captures failed messages after 3 retries

## Prerequisites

- Node.js 18.x or higher
- AWS CLI configured with appropriate credentials
- AWS account with permissions to create:
  - Lambda functions
  - SNS topics
  - SQS queues
  - CloudFormation stacks
  - IAM roles

## Installation

1. Install dependencies:
```bash
npm install
```

2. Install Serverless Framework globally (optional):
```bash
npm install -g serverless
```

## Configuration

The service is configured via `serverless.yml`. Key settings:

- **Region**: Defaults to `us-east-1` (change in `serverless.yml`)
- **Stage**: Defaults to `dev` (use `--stage prod` for production)
- **Memory**: 256 MB
- **Timeout**: 30 seconds
- **Batch Size**: 10 messages per invocation
- **Max Receive Count**: 3 attempts before DLQ

## Building

Compile TypeScript to JavaScript:
```bash
npm run build
```

## Deployment

Deploy to AWS:
```bash
npm run deploy
```

Deploy to a specific stage:
```bash
serverless deploy --stage prod
```

## Viewing Logs

Stream logs from the Lambda function:
```bash
npm run logs
```

## Removing the Service

Remove all AWS resources:
```bash
npm run remove
```

## Testing

### Local Testing

You can test the SQS functionality locally by running the local entry point. This will poll your AWS SQS queue and process messages:

```bash
# Run locally (one-time execution)
npm run local

# Run locally with auto-reload on file changes
npm run local:watch
```

#### Environment Variables for Local Testing

You can configure the local runner using environment variables:

```bash
# Required: Set AWS account ID
export AWS_ACCOUNT_ID=123456789012

# Set queue name (defaults to icpa-sns-sqs-lambda-dev-queue)
export SQS_QUEUE_NAME=icpa-sns-sqs-lambda-dev-queue

# Set AWS region (defaults to us-east-1)
export AWS_REGION=us-east-1

# Set poll interval in milliseconds (defaults to 5000ms)
export POLL_INTERVAL=5000

# Set max messages per poll (defaults to 10)
export MAX_MESSAGES=10

npm run local
```

**Note**: Make sure your AWS credentials are configured (via `~/.aws/credentials` or environment variables) before running locally. The `AWS_ACCOUNT_ID` environment variable is **required**.

### Publish a message to SNS

After deployment, you'll get the SNS Topic ARN in the outputs. Use AWS Console or AWS CLI to publish a test message:

#### Using AWS Console:
1. Go to SNS → Topics
2. Select your topic
3. Click "Publish message"
4. Enter your message (JSON format)
5. Click "Publish message"

The message will flow: SNS → SQS → Your local handler (if running `npm run local`)

#### Using AWS CLI:

```bash
aws sns publish \
  --topic-arn <YOUR_SNS_TOPIC_ARN> \
  --message '{"key": "value", "data": "test message"}' \
  --subject "Test Message"
```

### Publish a message directly to SQS (for testing)

```bash
aws sqs send-message \
  --queue-url <YOUR_SQS_QUEUE_URL> \
  --message-body '{"test": "data"}'
```

## Message Flow

1. **SNS Message**: Published to SNS topic
2. **SNS → SQS**: SNS forwards message to SQS queue
3. **SQS → Lambda**: Lambda is triggered by SQS event
4. **Processing**: Lambda extracts and processes the message
5. **DLQ**: Failed messages (after 3 retries) go to Dead Letter Queue

## Customization

### Modify Business Logic

Edit `src/handler.ts` and update the `processBusinessLogic` function to implement your specific requirements.

### Adjust Configuration

Modify `serverless.yml` to:
- Change memory/timeout settings
- Adjust batch size
- Modify retry policies
- Add environment variables
- Configure additional AWS resources

## Outputs

After deployment, the following outputs are available:

- `SnsTopicArn`: ARN of the SNS Topic
- `SqsQueueUrl`: URL of the SQS Queue
- `SqsQueueArn`: ARN of the SQS Queue

## Error Handling

- Failed messages are retried up to 3 times
- After 3 failures, messages are moved to the Dead Letter Queue
- Lambda supports partial batch failure reporting (for FIFO queues)

## Monitoring

Monitor your service via:
- AWS CloudWatch Logs (automatically created)
- AWS CloudWatch Metrics
- AWS X-Ray (if enabled)

## License

ISC

