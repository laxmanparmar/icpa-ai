import { S3Service } from '../services/s3Service';
import { ImageProcessor, CarDetails } from '../services/imageProcessor';
import { PDFProcessor, StructuredPDFData } from '../services/pdfProcessor';
import { QdrantService, PolicyDocument } from '../services/qdrantService';
import { ClaimEvaluator, ClaimEvaluationResult } from '../services/claimEvaluator';
import { ChatOpenAI } from '@langchain/openai';

export interface ProcessingChainResult {
  userId: string;
  step1_s3Files: {
    totalFiles: number;
    fileKeys: string[];
  };
  step2_imageProcessing: {
    processedImages: number;
    carDetails: CarDetails[];
  };
  step3_pdfProcessing: {
    processedPDFs: number;
    pdfData: StructuredPDFData[];
  };
  step4_policyRetrieval: {
    retrievedPolicies: number;
    policies: PolicyDocument[];
  };
  step5_claimEvaluation: ClaimEvaluationResult;
  processingTime: number;
  errors: string[];
}

/**
 * Step 1: Pull data from S3
 */
async function step1_pullDataFromS3(
  userId: string,
  bucketName: string,
  awsRegion: string
): Promise<{ totalFiles: number; fileKeys: string[] }> {
  console.log(`[Step 1] Pulling data from S3 for userId: ${userId}`);
  
  const s3Service = new S3Service(bucketName, awsRegion);
  const files = await s3Service.fetchFilesByUserId(userId);
  
  const fileKeys = files.map(file => file.key);
  
  console.log(`[Step 1] Found ${files.length} files in S3`);
  return {
    totalFiles: files.length,
    fileKeys,
  };
}

/**
 * Step 2: Process images only
 */
async function processImages(
  fileKeys: string[],
  bucketName: string,
  awsRegion: string,
  openAIApiKey: string
): Promise<{ processedImages: number; carDetails: CarDetails[] }> {
  console.log(`Processing images...`);
  
  const s3Service = new S3Service(bucketName, awsRegion);
  const imageProcessor = new ImageProcessor(openAIApiKey);
  const carDetails: CarDetails[] = [];
  
  // Filter image files
  const imageFiles = fileKeys.filter(key => {
    const ext = key.toLowerCase().split('.').pop();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '');
  });
  
  console.log(`Found ${imageFiles.length} image files to process`);
  
  // Process each image
  for (const fileKey of imageFiles) {
    try {
      const fileBuffer = await s3Service.downloadFile(fileKey);
      const contentType = await s3Service.getFileContentType(fileKey);
      
      // Validate it's an image file
      const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const isImage = imageTypes.includes(contentType.toLowerCase()) || 
                     imageExtensions.some(ext => fileKey.toLowerCase().endsWith(ext));
      
      if (isImage) {
        const details = await imageProcessor.processImage(fileBuffer, contentType);
        carDetails.push(details);
        console.log(`Processed image: ${fileKey}, ${JSON.stringify(details)}`);
      }
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
    temperature: 0,
    maxTokens: 3000,
  });
  const pdfProcessor = new PDFProcessor(llm);
  const pdfData: StructuredPDFData[] = [];
  
  const pdfFiles = fileKeys.filter(key => key.toLowerCase().endsWith('.pdf'));
  
  console.log(`Found ${pdfFiles.length} PDF files to process`);
  
  for (const fileKey of pdfFiles) {
    try {
      const fileBuffer = await s3Service.downloadFile(fileKey);
      const data = await pdfProcessor.processPDF(fileBuffer);
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


async function retrievePolicies(
  userId: string,
  qdrantUrl: string,
  openAIApiKey: string,
  qdrantApiKey: string,
  qdrantCollectionName: string,
  source: string
): Promise<{ retrievedPolicies: number; policies: PolicyDocument[] }> {
  console.log(`Retrieving policies from Qdrant...`);
  
  const qdrantService = new QdrantService(
    qdrantUrl,
    openAIApiKey,
    qdrantCollectionName,
    qdrantApiKey
  );
  
  const query = 'company policy'
  
  const policies = await qdrantService.searchPolicies(query, 10, source);
  
  if (policies.length === 0 && userId) {
    console.log(`No policies found with source filter, trying with userId filter...`);
    const policiesWithUserId = await qdrantService.searchPoliciesWithFilter(query, 10, {
      source: source,
      userId: userId,
    });
    policies.push(...policiesWithUserId);
  }
  
  console.log(`Retrieved ${policies.length} policies from Qdrant`);
  return {
    retrievedPolicies: policies.length,
    policies,
  };
}

/**
 * Evaluate claim with deterministic LLM output
 */
async function evaluateClaim(
  userId: string,
  carDetails: CarDetails[],
  pdfData: StructuredPDFData[],
  policies: PolicyDocument[],
  openAIApiKey: string
): Promise<ClaimEvaluationResult> {
  console.log(`Evaluating claim...`);
  
  const llm = new ChatOpenAI({
    modelName: 'gpt-4o',
    openAIApiKey: openAIApiKey,
    temperature: 0,
    maxTokens: 3000,
  });
  const claimEvaluator = new ClaimEvaluator(llm);
  
  const evaluation = await claimEvaluator.evaluateClaim({
    userId,
    carDetails,
    pdfData: pdfData.map(pdf => ({
      text: pdf.text,
      extractedFields: pdf.extractedFields || {}
    })),
    policyDocuments: policies,
  });
  
  console.log(`Claim evaluation completed: ${evaluation.decision}`);
  return evaluation;
}

/**
 * Main orchestration function - chains all steps together
 */
export async function processClaimChain(
  userId: string,
  bucketName: string,
  openAIApiKey: string,
  awsRegion: string,
  qdrantUrl: string,
  qdrantApiKey: string,
  qdrantCollectionName: string
): Promise<void> {
  const startTime = Date.now();
  const errors: string[] = [];
  
  console.log(`\n========== Starting Claim Processing Chain for userId: ${userId} ==========`);
  
  try {
    const s3Result = await step1_pullDataFromS3(userId, bucketName, awsRegion);
    
    if (s3Result.totalFiles === 0) {
      throw new Error('No files found in S3 for this userId');
    }
    
    const imageResult = await processImages(
      s3Result.fileKeys,
      bucketName,
      awsRegion,
      openAIApiKey
    );
    
    
    const pdfResult = await processPDFs(
      s3Result.fileKeys,
      bucketName,
      awsRegion,
      openAIApiKey
    );
    
    
    const policyResult = await retrievePolicies(
      userId,
      qdrantUrl,
      openAIApiKey,
      qdrantApiKey,
      qdrantCollectionName,
      'insurance_claim_policy'
    );
    
    console.log(JSON.stringify(policyResult.policies, null, 2));

    const evaluationResult = await evaluateClaim(
      userId,
      imageResult.carDetails,
      pdfResult.pdfData,
      policyResult.policies,
      openAIApiKey
    );
    
    console.log(JSON.stringify(evaluationResult, null, 2));
    // const processingTime = Date.now() - startTime;
    
    // console.log(`\n========== Completed Claim Processing Chain ==========`);
    // console.log(`Total processing time: ${processingTime}ms`);
    // console.log(`Final decision: ${evaluationResult.decision} (confidence: ${evaluationResult.confidence}%)`);
    
    // return {
    //   userId,
    //   step1_s3Files: s3Result,
    //   step2_imageProcessing: imageResult,
    //   step3_pdfProcessing: pdfResult,
    //   step4_policyRetrieval: policyResult,
    //   step5_claimEvaluation: evaluationResult,
    //   processingTime,
    //   errors,
    // };
  } catch (error) {
    throw error;
  }
}

