import { RunnableLambda } from "@langchain/core/runnables";
import { S3Service } from "../services";

async function pullDataFromS3(
    userId: string,
    bucketName: string,
    awsRegion: string
  ): Promise<{ totalFiles: number; fileKeys: string[] }> {
    console.log(`Pulling data from S3 for userId: ${userId}`);
    
    const s3Service = new S3Service(bucketName, awsRegion);
    const files = await s3Service.fetchFilesByUserId(userId);
    
    const fileKeys = files.map(file => file.key);
    
    console.log(`Found ${files.length} files in S3`);
    return {
      totalFiles: files.length,
      fileKeys,
    };
}

export const s3FileProcessChain = ({
    userId,
    bucketName,
    awsRegion,
}: {
    userId: string;
    bucketName: string;
    awsRegion: string;
}) => {
    return new RunnableLambda({
        func: async () => {
          const result = await pullDataFromS3(userId, bucketName, awsRegion);
          if (result.totalFiles === 0) {
            throw new Error('No files found in S3 for this userId');
          }
          return result;
        },
      });
}