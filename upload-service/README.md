# Upload Service

A TypeScript-based upload service that provides presigned S3 URLs for file uploads. Can run locally with Express or be deployed as an AWS Lambda function.

## Features

- Generate presigned S3 URLs for file uploads
- User-specific folder structure (users/{userId}/)
- Local development with Express server
- Production deployment as AWS Lambda

## Prerequisites

- Node.js 18.x or higher
- npm or yarn
- AWS account with S3 bucket
- AWS credentials configured

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

Edit `.env` with your AWS credentials and S3 bucket name:
```
PORT=3000
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
S3_BUCKET_NAME=your-bucket-name
PRESIGNED_URL_EXPIRY=3600
```

3. Build the project:
```bash
npm run build
```

## Local Development

Run the Express server locally:

```bash
npm run dev
```

The server will start on `http://localhost:3000`

### Endpoints

#### Health Check
```
GET /health
```

#### Get Presigned URL
```
GET /presigned-url?userId=<userId>&fileName=<fileName>
```

**Parameters:**
- `userId` (required): User identifier for folder organization
- `fileName` (required): Name of the file to upload

**Response:**
```json
{
  "presignedUrl": "https://s3.amazonaws.com/...",
  "key": "users/user123/file.jpg",
  "expiresIn": 3600,
  "userId": "user123",
  "fileName": "file.jpg"
}
```

**Example:**
```bash
curl "http://localhost:3000/presigned-url?userId=user123&fileName=photo.jpg"
```

## Production Deployment

### Deploy to AWS Lambda

1. Install Serverless Framework globally (if not already installed):
```bash
npm install -g serverless
```

2. Configure AWS credentials:
```bash
aws configure
```

Or set environment variables:
```bash
export AWS_ACCESS_KEY_ID=your-access-key-id
export AWS_SECRET_ACCESS_KEY=your-secret-access-key
export S3_BUCKET_NAME=your-bucket-name
```

3. Deploy:
```bash
npm run deploy
```

The deployment will create an API Gateway endpoint that routes to your Lambda function.

### Lambda Configuration

The service uses the `serverless-http` package to wrap the Express app for Lambda compatibility. The Lambda function will have the necessary IAM permissions to write to the S3 bucket.

## Project Structure

```
upload-service/
├── src/
│   ├── server.ts          # Express server setup
│   └── handler.ts         # Lambda handler wrapper
├── dist/                  # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
├── serverless.yml         # Serverless Framework configuration
└── .env.example           # Environment variables template
```

## Environment Variables

- `PORT`: Port for local Express server (default: 3000)
- `AWS_REGION`: AWS region (default: us-east-1)
- `AWS_ACCESS_KEY_ID`: AWS access key ID
- `AWS_SECRET_ACCESS_KEY`: AWS secret access key
- `S3_BUCKET_NAME`: S3 bucket name for uploads
- `PRESIGNED_URL_EXPIRY`: Presigned URL expiration in seconds (default: 3600)

## Usage Example

1. Get a presigned URL:
```bash
curl "http://localhost:3000/presigned-url?userId=user123&fileName=document.pdf"
```

2. Upload file using the presigned URL:
```bash
curl -X PUT "https://s3.amazonaws.com/your-bucket/users/user123/document.pdf?...presigned-url..." \
  --upload-file ./document.pdf \
  -H "Content-Type: application/pdf"
```

## Notes

- Files are organized in S3 with the structure: `users/{userId}/{fileName}`
- Presigned URLs expire after the configured time (default: 1 hour)
- The Lambda function includes CORS headers for cross-origin requests

