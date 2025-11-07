import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';

export interface ClaimEvaluationResult {
  decision: 'Approved' | 'Rejected';
  confidence: number;
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


  async evaluateClaim(input: ClaimEvaluationInput): Promise<ClaimEvaluationResult> {
    try {
      console.log('Starting claim evaluation...');

      const systemPrompt = `You are an expert insurance claim evaluator. Your task is to analyze all available information and make a deterministic decision on whether to approve or reject an insurance claim.

Rules for evaluation:
1. Carefully analyze all car damage details from images
2. Review Police Report Documents
3. Compare against Company Policy Documents
4. Ensure the claim is within Company Policy Documents coverage
5. Verify all required information is present
6. Check for any inconsistencies or fraud indicators

You must provide:
- A clear decision: "Approved" or "Rejected"
- Confidence level (0-100) based on available information
- Detailed reasoning for your decision
- References to relevant policy sections
- Key factors that influenced your decision

Be thorough, accurate, and consistent. The same input should always produce the same output.`;

      const carDetailsText = this.formatCarDetails(input.carDetails);
      const policeReportText = this.formatPDFData(input.pdfData);
      const companyPolicyText = this.formatPolicyDocuments(input.policyDocuments);

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

      const jsonSchemaString = JSON.stringify(jsonSchema, null, 2)
        .replace(/\{/g, '{{')
        .replace(/\}/g, '}}');

      const humanPromptTemplate = `Evaluate the following insurance claim for user ID: {userId}

CAR DETAILS FROM IMAGES:
{carDetails}

Police Report Documents:
{policeReportText}

Company Policy Documents:
{companyPolicyText}


USER POLICY DOCUMENTS:
policy number: 12333
claim number: 4556567
claim amount: 10000
claim date: 2025-11-05
user email: test@test.com

You must respond with a valid JSON object matching this exact schema:
{jsonSchema}

Respond ONLY with the JSON object, no additional text or markdown formatting.`;


      const prompt = ChatPromptTemplate.fromMessages([
        SystemMessagePromptTemplate.fromTemplate(systemPrompt),
        HumanMessagePromptTemplate.fromTemplate(humanPromptTemplate),
      ]);


      const chain = prompt.pipe(this.llm);
      const response = await chain.invoke({
        userId: input.userId,
        carDetails: carDetailsText,
        policeReportText: policeReportText,
        companyPolicyText: companyPolicyText,
        jsonSchema: jsonSchemaString,
      });
      
      let content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in LLM response');
      }

      const parsedResult = JSON.parse(jsonMatch[0]);
      const validatedResult = ClaimEvaluationSchema.parse(parsedResult);

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
      return evaluation;
    } catch (error) {
      console.error('Error evaluating claim:', error);
      return {
        decision: 'Rejected',
        confidence: 0,
        reasoning: `Error during evaluation: ${error instanceof Error ? error.message : 'Unknown error'}`,
        policyReferences: [],
        keyFactors: ['Evaluation error occurred'],
      };
    }
  }


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

