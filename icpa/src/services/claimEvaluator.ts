import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';

export interface ClaimEvaluationResult {
  decision: 'Approved' | 'Rejected';
  confidence: number; // 0-100
  reasoning: string;
  policyReferences: string[];
  keyFactors: string[];
}

export interface ClaimEvaluationInput {
  carDetails: Array<{
    carColor: string | null;
    carModel: string | null;
    carNumber: string | null;
    damageArea: string | null;
    description: string | null;
  }>;
  pdfData: Array<{
    text: string;
    extractedFields: Record<string, any>;
  }>;
  policyDocuments: Array<{
    id: string;
    content: string;
    metadata?: Record<string, any>;
  }>;
  userId: string;
}

// Structured output schema for validation
const ClaimEvaluationSchema = z.object({
  decision: z.enum(['Approved', 'Rejected']).describe('The final decision on the claim'),
  confidence: z
    .number()
    .min(0)
    .max(100)
    .describe('Confidence level from 0 to 100'),
  reasoning: z.string().describe('Detailed reasoning for the decision'),
  policyReferences: z
    .array(z.string())
    .describe('References to relevant policy sections or document IDs'),
  keyFactors: z
    .array(z.string())
    .describe('Key factors that influenced the decision'),
});

export class ClaimEvaluator {
  private llm: ChatOpenAI;

  constructor(llm: ChatOpenAI) {
    this.llm = llm;
  }

  /**
   * Evaluate insurance claim based on all collected information
   * Uses structured output for deterministic results
   */
  async evaluateClaim(input: ClaimEvaluationInput): Promise<ClaimEvaluationResult> {
    try {
      console.log('Starting claim evaluation...');

      // Prepare system prompt
      const systemPrompt = `You are an expert insurance claim evaluator. Your task is to analyze all available information and make a deterministic decision on whether to approve or reject an insurance claim.

Rules for evaluation:
1. Carefully analyze all car damage details from images
2. Review PDF documents for claim information, policy details, and incident reports
3. Compare against policy documents retrieved from the knowledge base
4. Ensure the claim is within policy coverage
5. Verify all required information is present
6. Check for any inconsistencies or fraud indicators

You must provide:
- A clear decision: "Approved" or "Rejected"
- Confidence level (0-100) based on available information
- Detailed reasoning for your decision
- References to relevant policy sections
- Key factors that influenced your decision

Be thorough, accurate, and consistent. The same input should always produce the same output.`;

      // Prepare human prompt with all information
      const carDetailsText = this.formatCarDetails(input.carDetails);
      const pdfDataText = this.formatPDFData(input.pdfData);
      const policyText = this.formatPolicyDocuments(input.policyDocuments);

      const jsonSchema = {
        type: 'object',
        properties: {
          decision: {
            type: 'string',
            enum: ['Approved', 'Rejected'],
            description: 'The final decision on the claim',
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 100,
            description: 'Confidence level from 0 to 100',
          },
          reasoning: {
            type: 'string',
            description: 'Detailed reasoning for the decision',
          },
          policyReferences: {
            type: 'array',
            items: { type: 'string' },
            description: 'References to relevant policy sections or document IDs',
          },
          keyFactors: {
            type: 'array',
            items: { type: 'string' },
            description: 'Key factors that influenced the decision',
          },
        },
        required: ['decision', 'confidence', 'reasoning', 'policyReferences', 'keyFactors'],
      };

      // Escape curly braces in JSON schema for template parsing
      const jsonSchemaString = JSON.stringify(jsonSchema, null, 2)
        .replace(/\{/g, '{{')
        .replace(/\}/g, '}}');

      const humanPromptTemplate = `Evaluate the following insurance claim for user ID: {userId}

CAR DETAILS FROM IMAGES:
{carDetails}

PDF DOCUMENT INFORMATION:
{pdfData}

POLICY DOCUMENTS:
{policyDocuments}

You must respond with a valid JSON object matching this exact schema:
{jsonSchema}

Respond ONLY with the JSON object, no additional text or markdown formatting.`;

      // Create chat prompt
      const prompt = ChatPromptTemplate.fromMessages([
        SystemMessagePromptTemplate.fromTemplate(systemPrompt),
        HumanMessagePromptTemplate.fromTemplate(humanPromptTemplate),
      ]);

      // Generate response
      const chain = prompt.pipe(this.llm);
      const response = await chain.invoke({
        userId: input.userId,
        carDetails: carDetailsText,
        pdfData: pdfDataText,
        policyDocuments: policyText,
        jsonSchema: jsonSchemaString,
      });
      
      // Extract JSON from response
      let content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      
      // Remove markdown code blocks if present
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      // Try to extract JSON object
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in LLM response');
      }

      const parsedResult = JSON.parse(jsonMatch[0]);

      // Validate with Zod schema
      const validatedResult = ClaimEvaluationSchema.parse(parsedResult);

      // Format result
      const evaluation: ClaimEvaluationResult = {
        decision: validatedResult.decision === 'Approved' ? 'Approved' : 'Rejected',
        confidence: Math.max(0, Math.min(100, validatedResult.confidence)),
        reasoning: validatedResult.reasoning || 'No reasoning provided',
        policyReferences: Array.isArray(validatedResult.policyReferences) 
          ? validatedResult.policyReferences 
          : [],
        keyFactors: Array.isArray(validatedResult.keyFactors) 
          ? validatedResult.keyFactors 
          : [],
      };

      console.log(`Claim evaluation completed: ${evaluation.decision} (confidence: ${evaluation.confidence}%)`);
      return evaluation;
    } catch (error) {
      console.error('Error evaluating claim:', error);
      // Return a safe default on error
      return {
        decision: 'Rejected',
        confidence: 0,
        reasoning: `Error during evaluation: ${error instanceof Error ? error.message : 'Unknown error'}`,
        policyReferences: [],
        keyFactors: ['Evaluation error occurred'],
      };
    }
  }

  /**
   * Format car details for prompt
   */
  private formatCarDetails(carDetails: Array<ClaimEvaluationInput['carDetails'][0]>): string {
    if (carDetails.length === 0) {
      return 'No car images were processed.';
    }

    return carDetails
      .map((detail, index) => {
        return `Image ${index + 1}:
- Car Color: ${detail.carColor || 'Not detected'}
- Car Model: ${detail.carModel || 'Not detected'}
- Car Number: ${detail.carNumber || 'Not detected'}
- Damage Area: ${detail.damageArea || 'Not detected'}
- Description: ${detail.description || 'No description available'}`;
      })
      .join('\n\n');
  }

  /**
   * Format PDF data for prompt
   */
  private formatPDFData(pdfData: Array<ClaimEvaluationInput['pdfData'][0]>): string {
    if (pdfData.length === 0) {
      return 'No PDF documents were processed.';
    }

    return pdfData
      .map((pdf, index) => {
        const fields = Object.entries(pdf.extractedFields || {})
          .map(([key, value]) => `  - ${key}: ${value}`)
          .join('\n');

        return `PDF Document ${index + 1}:
Extracted Fields:
${fields || '  - No structured fields extracted'}

Text Content (first 2000 chars):
${pdf.text.substring(0, 2000)}${pdf.text.length > 2000 ? '...' : ''}`;
      })
      .join('\n\n');
  }

  /**
   * Format policy documents for prompt
   */
  private formatPolicyDocuments(
    policies: Array<ClaimEvaluationInput['policyDocuments'][0]>
  ): string {
    if (policies.length === 0) {
      return 'No policy documents were retrieved from the knowledge base.';
    }

    return policies
      .map((policy, index) => {
        const metadata = policy.metadata
          ? Object.entries(policy.metadata)
              .map(([key, value]) => `  - ${key}: ${value}`)
              .join('\n')
          : '  - No metadata available';

        return `Policy Document ${index + 1} (ID: ${policy.id}):
Metadata:
${metadata}

Content:
${policy.content.substring(0, 1500)}${policy.content.length > 1500 ? '...' : ''}`;
      })
      .join('\n\n');
  }
}

