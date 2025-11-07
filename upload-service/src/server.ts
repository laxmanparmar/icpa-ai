import express, { Request, Response } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || '';

if (!BUCKET_NAME) {
  console.warn('Warning: S3_BUCKET_NAME environment variable is not set');
}

app.use(express.json());

app.post('/presigned-url/:userId', async (req: Request, res: Response) => {
  try {
    const { fileName, fileType } = req.body;
    const userId = req.params.userId;

    const key = `users/${userId}/${fileName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: fileType
    });

    const expiresIn = parseInt(process.env.PRESIGNED_URL_EXPIRY || '600', 10);
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn });

    res.json({
      presignedUrl,
      key,
      expiresIn,
      userId,
      fileName,
      fileType,
    });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    res.status(500).json({
      error: 'Failed to generate presigned URL',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});


if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Presigned URL endpoint: http://localhost:${PORT}/presigned-url?userId=<userId>[&fileName=<fileName>][&fileExtension=<ext>]`);
  });
}

export { app };

