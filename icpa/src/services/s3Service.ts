import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

export interface S3File {
  key: string;
  contentType?: string;
  size?: number;
  lastModified?: Date;
}

export class S3Service {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(bucketName: string, region: string = 'us-east-1') {
    this.bucketName = bucketName;
    this.s3Client = new S3Client({ region });
  }

  /**
   * Fetch all files from a folder organized by userId
   * @param userId - The user ID to fetch files for
   * @returns Array of file metadata
   */
  async fetchFilesByUserId(userId: string): Promise<S3File[]> {
    try {
      const prefix = `users/${userId}/`;
      
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
      });

      const response = await this.s3Client.send(command);
      
      if (!response.Contents || response.Contents.length === 0) {
        console.log(`No files found for userId: ${userId}`);
        return [];
      }

      const files: S3File[] = response.Contents.map((object) => ({
        key: object.Key || '',
        contentType: undefined, // Will be determined when downloading
        size: object.Size,
        lastModified: object.LastModified,
      }));

      console.log(`Found ${files.length} files for userId: ${userId}`);
      return files;
    } catch (error) {
      console.error(`Error fetching files for userId ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Download a file from S3
   * @param key - The S3 object key
   * @returns Buffer containing the file content
   */
  async downloadFile(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      
      if (!response.Body) {
        throw new Error(`File ${key} has no body`);
      }

      // Convert stream to buffer
      const stream = response.Body as Readable;
      const chunks: Uint8Array[] = [];
      
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);
      return buffer;
    } catch (error) {
      console.error(`Error downloading file ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get file content type
   * @param key - The S3 object key
   * @returns Content type string
   */
  async getFileContentType(key: string): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      return response.ContentType || 'application/octet-stream';
    } catch (error) {
      console.error(`Error getting content type for ${key}:`, error);
      // Fallback to extension-based detection
      return this.getContentTypeFromExtension(key);
    }
  }

  /**
   * Determine content type from file extension
   */
  private getContentTypeFromExtension(key: string): string {
    const extension = key.toLowerCase().split('.').pop();
    const contentTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'pdf': 'application/pdf',
      'txt': 'text/plain',
    };
    return contentTypes[extension || ''] || 'application/octet-stream';
  }
}

