import { ChatOpenAI } from "@langchain/openai";
import { CarDetails, ImageProcessor, S3Service, PDFProcessor, StructuredPDFData } from "../services";
import { RunnableLambda } from "@langchain/core/runnables";
import { humanPromptForPolicyDocumentExtraction, systemPromptForPolicyDocumentExtraction } from "../utils/prompt";

async function processImages(
    fileKeys: string[],
    bucketName: string,
    awsRegion: string,
    openAIApiKey: string
  ): Promise<{ processedImages: number; carDetails: CarDetails[] }> {
    console.log(`Processing images...`);
    
    const s3Service = new S3Service(bucketName, awsRegion);
    const llm = new ChatOpenAI({
      modelName: 'gpt-4o',
      openAIApiKey: openAIApiKey,
      temperature: 0.1,
      maxTokens: 3000,
    });
    const imageProcessor = new ImageProcessor(llm);
    const carDetails: CarDetails[] = [];
    
    const imageFiles = fileKeys.filter(key => {
      const ext = key.toLowerCase().split('.').pop();
      return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '');
    });
    
    console.log(`Found ${imageFiles.length} image files to process`);
    
    for (const fileKey of imageFiles) {
      try {
        const fileBuffer = await s3Service.downloadFile(fileKey);
        const contentType = await s3Service.getFileContentType(fileKey);
        
        const details = await imageProcessor.processImage(fileBuffer, contentType);
        carDetails.push(details);
        console.log(`Processed image: ${fileKey}, ${JSON.stringify(details)}`);
        
      } catch (error) {
        console.error(`Error processing image ${fileKey}:`, error);
      }
    }
    
    console.log(`Completed processing ${carDetails.length} images`);
    return {
      processedImages: carDetails.length,
      carDetails,
    };
  }
  
  async function processPDFs(
    fileKeys: string[],
    bucketName: string,
    awsRegion: string,
    openAIApiKey: string
  ): Promise<{ processedPDFs: number; pdfData: StructuredPDFData[] }> {
    console.log(`Processing PDFs...`);
    
    const s3Service = new S3Service(bucketName, awsRegion);
    const llm = new ChatOpenAI({
      modelName: 'gpt-4o',
      openAIApiKey: openAIApiKey,
      temperature: 0.1,
      maxTokens: 3000,
    });
    const pdfProcessor = new PDFProcessor(llm);
    const pdfData: StructuredPDFData[] = [];
    
    const pdfFiles = fileKeys.filter(key => key.toLowerCase().endsWith('.pdf'));
    
    console.log(`Found ${pdfFiles.length} PDF files to process`);
    
    for (const fileKey of pdfFiles) {
      try {
        const fileBuffer = await s3Service.downloadFile(fileKey);
        const data = await pdfProcessor.processPDF(fileBuffer, systemPromptForPolicyDocumentExtraction, humanPromptForPolicyDocumentExtraction);
        console.log(`Processed PDF: ${fileKey}, ${JSON.stringify(data)}`);
        pdfData.push(data);
      } catch (error) {
        console.error(`Error processing PDF ${fileKey}:`, error);
      }
    }
    
    console.log(`Completed processing ${pdfData.length} PDFs`);
    return {
      processedPDFs: pdfData.length,
      pdfData,
    };
  }


  export const processFilesChain = ({
    bucketName,
    awsRegion,
    openAIApiKey,
  }: {
    bucketName: string;
    awsRegion: string;
    openAIApiKey: string;
  }) => {
    return new RunnableLambda({
        func: async (s3Result: { totalFiles: number; fileKeys: string[] }) => {
          const [imageResult, pdfResult] = await Promise.all([
            processImages(s3Result.fileKeys, bucketName, awsRegion, openAIApiKey),
            processPDFs(s3Result.fileKeys, bucketName, awsRegion, openAIApiKey),
          ]);
          return { imageResult, pdfResult };
        },
      });
  }