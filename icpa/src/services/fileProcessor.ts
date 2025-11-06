import { S3Service, S3File } from './s3Service';
import { ImageProcessor, CarDetails } from './imageProcessor';
import { PDFProcessor, StructuredPDFData } from './pdfProcessor';

export interface ProcessedFileResult {
  file: S3File;
  type: 'image' | 'pdf' | 'unknown';
  carDetails?: CarDetails;
  pdfData?: StructuredPDFData;
  error?: string;
}

export interface ProcessedFilesResult {
  userId: string;
  files: ProcessedFileResult[];
  totalFiles: number;
  processedFiles: number;
  failedFiles: number;
}

export class FileProcessor {
  private s3Service: S3Service;
  private imageProcessor: ImageProcessor;
  private pdfProcessor: PDFProcessor;

  constructor(
    bucketName: string,
    openAIApiKey: string,
    awsRegion: string = 'us-east-1'
  ) {
    this.s3Service = new S3Service(bucketName, awsRegion);
    this.imageProcessor = new ImageProcessor(openAIApiKey);
    this.pdfProcessor = new PDFProcessor(openAIApiKey);
  }

  /**
   * Process all files for a given userId
   * @param userId - The user ID to process files for
   * @returns Processed files result
   */
  async processFilesByUserId(userId: string): Promise<ProcessedFilesResult> {
    try {
      console.log(`Starting to process files for userId: ${userId}`);

      // Fetch all files for the userId
      const files = await this.s3Service.fetchFilesByUserId(userId);
      
      if (files.length === 0) {
        return {
          userId,
          files: [],
          totalFiles: 0,
          processedFiles: 0,
          failedFiles: 0,
        };
      }

      // Process each file
      const processedFiles: ProcessedFileResult[] = [];
      let processedCount = 0;
      let failedCount = 0;

      for (const file of files) {
        try {
          const result = await this.processFile(file);
          processedFiles.push(result);
          
          if (result.error) {
            failedCount++;
          } else {
            processedCount++;
          }
        } catch (error) {
          console.error(`Error processing file ${file.key}:`, error);
          processedFiles.push({
            file,
            type: 'unknown',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          failedCount++;
        }
      }

      console.log(
        `Completed processing files for userId: ${userId}. ` +
        `Processed: ${processedCount}, Failed: ${failedCount}`
      );

      return {
        userId,
        files: processedFiles,
        totalFiles: files.length,
        processedFiles: processedCount,
        failedFiles: failedCount,
      };
    } catch (error) {
      console.error(`Error processing files for userId ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Process a single file
   * @param file - S3 file metadata
   * @returns Processed file result
   */
  async processFile(file: S3File): Promise<ProcessedFileResult> {
    try {
      console.log(`Processing file: ${file.key}`);

      // Download the file
      const fileBuffer = await this.s3Service.downloadFile(file.key);
      
      // Get content type
      const contentType = await this.s3Service.getFileContentType(file.key);
      
      // Determine file type and process accordingly
      if (this.isImageFile(contentType, file.key)) {
        const carDetails = await this.imageProcessor.processImage(fileBuffer, contentType);
        return {
          file,
          type: 'image',
          carDetails,
        };
      } else if (this.isPDFFile(contentType, file.key)) {
        const pdfData = await this.pdfProcessor.processPDF(fileBuffer);
        return {
          file,
          type: 'pdf',
          pdfData,
        };
      } else {
        return {
          file,
          type: 'unknown',
          error: `Unsupported file type: ${contentType}`,
        };
      }
    } catch (error) {
      console.error(`Error processing file ${file.key}:`, error);
      return {
        file,
        type: 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if file is an image
   */
  private isImageFile(contentType: string, key: string): boolean {
    const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    
    return (
      imageTypes.includes(contentType.toLowerCase()) ||
      imageExtensions.some(ext => key.toLowerCase().endsWith(ext))
    );
  }

  /**
   * Check if file is a PDF
   */
  private isPDFFile(contentType: string, key: string): boolean {
    return (
      contentType.toLowerCase() === 'application/pdf' ||
      key.toLowerCase().endsWith('.pdf')
    );
  }
}

