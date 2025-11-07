import { S3Service } from '../services/s3Service';
import { ImageProcessor, CarDetails } from '../services/imageProcessor';
import { PDFProcessor, StructuredPDFData } from '../services/pdfProcessor';
import { QdrantService, PolicyDocument } from '../services/qdrantService';
import { ClaimEvaluator, ClaimEvaluationResult } from '../services/claimEvaluator';
import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { RunnableLambda } from '@langchain/core/runnables';
import { z } from 'zod';
import { HumanMessage } from '@langchain/core/messages';
import { createPolicyRetrievalTool } from '../ai_tools/policyRetrievalTool';
import { s3FileProcessChain } from './userS3Files';
import { processFilesChain } from './processFiles';

async function evaluateClaimWithTools(
  userId: string,
  carDetails: CarDetails[],
  pdfData: StructuredPDFData[],
  openAIApiKey: string,
  policyTool: DynamicStructuredTool
): Promise<ClaimEvaluationResult> {
  console.log(`Evaluating claim with tool-based policy retrieval...`);
  
  const llm = new ChatOpenAI({
    modelName: 'gpt-4o',
    openAIApiKey: openAIApiKey,
    temperature: 0,
    maxTokens: 3000,
  });
  
  // Bind the policy retrieval tool to the LLM
  const llmWithTools = llm.bindTools([policyTool]);
  
  // First, let the LLM decide if it needs to fetch policies
  const initialPrompt = `You are evaluating an insurance claim. You have access to:
- Car details from images: ${JSON.stringify(carDetails)}
- PDF document data: ${JSON.stringify(pdfData.map(pdf => ({ text: pdf.text.substring(0, 500), extractedFields: pdf.extractedFields })))}

Do you need to retrieve company policies to evaluate this claim? If yes, use the retrieve_policies tool. Otherwise, proceed with evaluation using the ClaimEvaluator.`;
  
  const initialResponse = await llmWithTools.invoke([new HumanMessage(initialPrompt)]);
  
  let policies: PolicyDocument[] = [];
  
  // Check if the LLM called the tool
  if (initialResponse.tool_calls && initialResponse.tool_calls.length > 0) {
    for (const toolCall of initialResponse.tool_calls) {
      if (toolCall.name === 'retrieve_policies') {
        const toolResult = await policyTool.invoke(toolCall.args as any);
        const parsedResult = JSON.parse(toolResult);
        policies = parsedResult.policies || [];
        console.log(`[Tool Call] LLM requested policy retrieval, got ${policies.length} policies`);
      }
    }
  }
  
  // Now evaluate with the retrieved policies
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
  
  console.log(`\n========== Starting Claim Processing Chain for userId: ${userId} ==========`);
  
  try {
    const policyTool = createPolicyRetrievalTool(
      userId,
      qdrantUrl,
      openAIApiKey,
      qdrantApiKey,
      qdrantCollectionName,
      'insurance_claim_policy'
    );
    
    const usersS3FilesChain = s3FileProcessChain({
      userId,
      bucketName,
      awsRegion,
    });
    
    const filesProcessingChain = processFilesChain({
      bucketName,
      awsRegion,
      openAIApiKey,
    });
    
    const step3 = new RunnableLambda({
      func: async ({ imageResult, pdfResult }: { 
        imageResult: { processedImages: number; carDetails: CarDetails[] },
        pdfResult: { processedPDFs: number; pdfData: StructuredPDFData[] }
      }) => {
        return await evaluateClaimWithTools(
          userId,
          imageResult.carDetails,
          pdfResult.pdfData,
          openAIApiKey,
          policyTool
        );
      },
    });
    
    // Chain all steps together using LangChain's pipe operator
    const chain = usersS3FilesChain.pipe(filesProcessingChain).pipe(step3);
    
    // Execute the chain
    const evaluationResult = await chain.invoke({});
    
    console.log(JSON.stringify(evaluationResult, null, 2));
    const processingTime = Date.now() - startTime;
    
    console.log(`\n========== Completed Claim Processing Chain ==========`);
    console.log(`Total processing time: ${processingTime}ms`);
    console.log(`Final decision: ${evaluationResult.decision} (confidence: ${evaluationResult.confidence}%)`);
    
  } catch (error) {
    console.error('Error in claim processing chain:', error);
    throw error;
  }
}

