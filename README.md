# ICPA Pipeline

Insurance Claim Processing Automation (ICPA) Pipeline - A serverless system for processing insurance claims using AI-powered document analysis, image processing, and policy matching.

## Overview

This repository contains a complete serverless pipeline for processing insurance claims. The system processes uploaded claim documents (images and PDFs), extracts relevant information, matches against policy documents stored in a vector database, and evaluates claims using AI.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│ Upload       │────▶│    S3       │────▶│   ICPA      │
│             │     │ Service      │     │   Bucket    │     │  Service    │
└─────────────┘     └──────────────┘     └─────────────┘     └─────────────┘
                                                                    │
                                                                    ▼
                                                          ┌─────────────┐
                                                          │   Qdrant    │
                                                          │  Vector DB  │
                                                          └─────────────┘
```

## Services

### 1. sync-policy

**Purpose**: One-time setup script to populate the Qdrant vector database with insurance policy documents.

**What it does**:
- Extracts text from PDF policy documents
- Splits text into chunks with configurable size and overlap
- Generates embeddings using OpenAI's `text-embedding-3-small` model
- Stores embeddings in Qdrant vector database for semantic search

**Location**: `sync-policy/`

**Usage**:
```bash
cd sync-policy
npm install
node index.js
```

**Required Environment Variables**:
- `QDRANT_URL` - Your Qdrant Cloud URL (or self-hosted instance)
- `QDRANT_API_KEY` - Your Qdrant API key
- `OPENAI_API_KEY` - Your OpenAI API key

**Configuration**:
- Default collection name: `insurance_docs`
- Default PDF file: `Insurance_Claim_Policy_Example.pdf`
- Chunk size: 1000 characters
- Chunk overlap: 100 characters

---

### 2. upload-service

**Purpose**: Provides presigned S3 URLs for secure file uploads. Files are organized by user ID in S3.

**What it does**:
- Generates presigned S3 URLs for file uploads
- Organizes files in S3 with structure: `users/{userId}/{fileName}`
- Can run locally with Express server or deploy as AWS Lambda function
- Supports CORS for cross-origin requests

**Location**: `upload-service/`

**Endpoints**:
- `POST /presigned-url` - Generate presigned URL for file upload
  - Body: `{ userId: string, fileName: string, fileType: string }`
  - Returns: `{ presignedUrl: string, key: string, expiresIn: number, userId: string, fileName: string, fileType: string }`
- `GET /health` - Health check endpoint

**Local Development**:
```bash
cd upload-service
npm install
npm run build
npm run local
```

**Deployment**:
```bash
cd upload-service
npm run deploy
```

**Required Environment Variables**:
- `S3_BUCKET_NAME` - Name of the S3 bucket for file uploads
- `AWS_REGION` - AWS region (default: `us-east-1`)
- `AWS_ACCESS_KEY_ID` - AWS access key ID (for local development)
- `AWS_SECRET_ACCESS_KEY` - AWS secret access key (for local development)
- `PRESIGNED_URL_EXPIRY` - Presigned URL expiration in seconds (default: `600`)

**Note**: When deployed to Lambda, AWS credentials are handled via IAM roles.

---

### 3. icpa (Insurance Claim Processing Automation)

**Purpose**: Main processing service that orchestrates the complete claim evaluation pipeline.

**What it does**:
1. **Pulls data from S3**: Retrieves all files for a given user ID
2. **Processes images**: Extracts car details (make, model, year, damage, etc.) using OpenAI Vision API
3. **Processes PDFs**: Extracts structured data from claim PDFs using GPT-4
4. **Retrieves policies**: Performs semantic search in Qdrant to find relevant policy documents
5. **Evaluates claims**: Uses deterministic LLM to evaluate the claim against policies and provide decision, confidence, reasoning, and key factors

**Location**: `icpa/`

**Architecture**:
- Event-driven: SNS Topic → SQS Queue → Lambda Function
- Dead Letter Queue (DLQ) for failed messages after 3 retries
- Processes messages in batches

**Local Testing**:
```bash
cd icpa
npm install
npm run build

# Set required environment variables (see below)
export AWS_ACCOUNT_ID=123456789012
export SQS_QUEUE_NAME=icpa-service-dev-queue
export AWS_REGION=us-east-1

npm run local
```

**Deployment**:
```bash
cd icpa
npm run build
npm run deploy
```

**Required Environment Variables**:

**For Deployment (via serverless.yml)**:
- `S3_BUCKET_NAME` - S3 bucket name containing uploaded files
- `OPENAI_API_KEY` - OpenAI API key for LLM and embeddings
- `QDRANT_URL` - Qdrant Cloud URL or instance URL
- `QDRANT_API_KEY` - Qdrant API key
- `QDRANT_COLLECTION_NAME` - Qdrant collection name (default: `policies`)
- `AWS_REGION` - AWS region (default: `us-east-1`)

**For Local Testing**:
- `AWS_ACCOUNT_ID` - Your AWS account ID (12 digits, required)
- `SQS_QUEUE_NAME` - Name of the SQS queue to poll
- `AWS_REGION` - AWS region
- `S3_BUCKET_NAME` - S3 bucket name
- `OPENAI_API_KEY` - OpenAI API key
- `QDRANT_URL` - Qdrant URL
- `QDRANT_API_KEY` - Qdrant API key
- `QDRANT_COLLECTION_NAME` - Qdrant collection name
- `POLL_INTERVAL` - Poll interval in milliseconds (default: `5000`)
- `MAX_MESSAGES` - Max messages per poll (default: `10`)

**Message Format**:
The service expects messages published to SNS with the following format:
```json
{
  "userId": "user123"
}
```

**Outputs** (after deployment):
- `SnsTopicArn` - ARN of the SNS Topic
- `SqsQueueUrl` - URL of the SQS Queue
- `SqsQueueArn` - ARN of the SQS Queue

---

## Service Execution Order

Follow these steps in order to set up and use the pipeline:

### Step 1: Initial Setup - Sync Policy Documents

**Purpose**: Populate the vector database with insurance policy documents.

```bash
cd sync-policy

# Create .env file with:
# QDRANT_URL=your_qdrant_url
# QDRANT_API_KEY=your_qdrant_api_key
# OPENAI_API_KEY=your_openai_api_key

npm install
node index.js
```

**Expected Result**: Policy documents are chunked, embedded, and stored in Qdrant collection `insurance_docs`.

---

### Step 2: Deploy Upload Service

**Purpose**: Enable users to upload claim documents (images and PDFs) to S3.

```bash
cd upload-service

# Set environment variables:
export S3_BUCKET_NAME=your-bucket-name
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export PRESIGNED_URL_EXPIRY=3600

npm install
npm run build
npm run deploy
```

**Expected Result**: API Gateway endpoint is created for generating presigned URLs.

**Note**: Ensure the S3 bucket exists and has appropriate IAM permissions configured.

---

### Step 3: Deploy ICPA Service

**Purpose**: Deploy the main claim processing service.

```bash
cd icpa

# Set environment variables:
export S3_BUCKET_NAME=your-bucket-name
export OPENAI_API_KEY=your_openai_api_key
export QDRANT_URL=your_qdrant_url
export QDRANT_API_KEY=your_qdrant_api_key
export QDRANT_COLLECTION_NAME=policies
export AWS_REGION=us-east-1

npm install
npm run build
npm run deploy
```

**Expected Result**: 
- SNS Topic created
- SQS Queue created
- Lambda function deployed
- DLQ configured

**Note**: Save the `SnsTopicArn` output for triggering claim processing.

---

### Step 4: Upload Claim Documents

**Purpose**: Users upload their claim documents (images and PDFs) to S3.

**Using the Upload Service API**:

```bash
# Get presigned URL
curl -X POST https://your-api-gateway-url/presigned-url \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "fileName": "claim-document.pdf",
    "fileType": "application/pdf"
  }'

# Upload file using presigned URL
curl -X PUT "presigned-url-from-response" \
  --upload-file ./claim-document.pdf \
  -H "Content-Type: application/pdf"
```

**Expected Result**: Files are stored in S3 at `users/{userId}/{fileName}`.

---

### Step 5: Trigger Claim Processing

**Purpose**: Start the claim processing pipeline for a user.

**Publish message to SNS**:

```bash
aws sns publish \
  --topic-arn <SNS_TOPIC_ARN_FROM_STEP_3> \
  --message '{"userId": "user123"}' \
  --subject "Process Claim"
```

**Expected Flow**:
1. SNS receives message
2. SNS forwards to SQS
3. SQS triggers Lambda
4. Lambda processes the claim:
   - Downloads files from S3 for the user
   - Processes images to extract car details
   - Processes PDFs to extract structured claim data
   - Retrieves relevant policies from Qdrant
   - Evaluates claim and generates decision

**Expected Result**: Claim is evaluated and results are logged to CloudWatch.

---

## Complete Environment Variables Summary

### sync-policy
```bash
QDRANT_URL=your_qdrant_url
QDRANT_API_KEY=your_qdrant_api_key
OPENAI_API_KEY=your_openai_api_key
```

### upload-service
```bash
S3_BUCKET_NAME=your-bucket-name
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key-id          # For local dev only
AWS_SECRET_ACCESS_KEY=your-secret-access-key  # For local dev only
PRESIGNED_URL_EXPIRY=3600                     # Optional, default: 600
```

### icpa (Deployment)
```bash
S3_BUCKET_NAME=your-bucket-name
OPENAI_API_KEY=your_openai_api_key
QDRANT_URL=your_qdrant_url
QDRANT_API_KEY=your_qdrant_api_key
QDRANT_COLLECTION_NAME=policies              # Optional, default: policies
AWS_REGION=us-east-1                         # Optional, default: us-east-1
```

### icpa (Local Testing)
```bash
AWS_ACCOUNT_ID=123456789012                  # Required, 12 digits
SQS_QUEUE_NAME=icpa-service-dev-queue
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-bucket-name
OPENAI_API_KEY=your_openai_api_key
QDRANT_URL=your_qdrant_url
QDRANT_API_KEY=your_qdrant_api_key
QDRANT_COLLECTION_NAME=policies
POLL_INTERVAL=5000                           # Optional, default: 5000
MAX_MESSAGES=10                              # Optional, default: 10
```

---

## Prerequisites

- **Node.js**: 18.x or higher
- **AWS Account**: With appropriate permissions for:
  - Lambda functions
  - S3 buckets
  - SNS topics
  - SQS queues
  - CloudFormation stacks
  - IAM roles
- **AWS CLI**: Configured with credentials
- **Serverless Framework**: For deployment (install globally: `npm install -g serverless`)
- **Qdrant**: Cloud account or self-hosted instance
- **OpenAI API Key**: For embeddings and LLM processing

---

## Monitoring

- **CloudWatch Logs**: All Lambda functions automatically log to CloudWatch
- **CloudWatch Metrics**: Monitor Lambda invocations, errors, and duration
- **Dead Letter Queue**: Failed messages after 3 retries are sent to DLQ
- **SQS Metrics**: Monitor queue depth and processing rates

---

## Troubleshooting

### Files not found in S3
- Verify files were uploaded successfully using the presigned URL
- Check S3 bucket name matches across all services
- Verify file path structure: `users/{userId}/{fileName}`

### Qdrant connection errors
- Verify `QDRANT_URL` and `QDRANT_API_KEY` are correct
- Check collection name matches (`insurance_docs` or `policies`)
- Ensure Qdrant instance is accessible from your network

### OpenAI API errors
- Verify `OPENAI_API_KEY` is valid and has sufficient credits
- Check rate limits if processing many files
- Ensure model access (`gpt-4o`, `text-embedding-3-small`)

### SQS/Lambda not triggering
- Verify SNS subscription to SQS is configured
- Check Lambda event source mapping
- Review CloudWatch logs for errors
- Check DLQ for failed messages

---

## License

ISC

