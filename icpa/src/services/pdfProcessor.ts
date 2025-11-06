import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';

export interface StructuredPDFData {
  text: string;
  extractedFields?: Record<string, any>;
}

const PDFExtractionSchema = z.object({
  policyNumber: z.string().nullable().optional(),
  claimNumber: z.string().nullable().optional(),
  claimDate: z.string().nullable().optional(),
  incidentDate: z.string().nullable().optional(),
  vehicleNumber: z.string().nullable().optional(),
  vehicleColor: z.string().nullable().optional(),
  vehicleModel: z.string().nullable().optional(),
  vehicleYear: z.string().nullable().optional(),
  policyholderName: z.string().nullable().optional(),
  policyholderPhone: z.string().nullable().optional(),
  policyholderEmail: z.string().nullable().optional(),
  claimAmount: z.string().nullable().optional(),
  damageDescription: z.string().nullable().optional(),
  accidentLocation: z.string().nullable().optional(),
  additionalInfo: z.record(z.any()).optional(),
});

export class PDFProcessor {
  private llm: ChatOpenAI;

  constructor(llm: ChatOpenAI) {
    this.llm = llm;
  }


  private async extractTextFromPDF(pdfBuffer: Buffer): Promise<{
    text: string;
  }> {
    try {
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      
      const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
      const pdfData = new Uint8Array(pdfBuffer);
      
      const loadingTask = pdfjsLib.getDocument({
        data: pdfData,
        useSystemFonts: true,
      });

      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;
      
      let fullText = '';
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += `\n--- Page ${pageNum} ---\n${pageText}`;
      }
      return { text: fullText.trim() };
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      return {
        text: '',
      };
    }
  }

  async processPDF(pdfBuffer: Buffer): Promise<StructuredPDFData> {
    try {
      console.log('Extracting text from PDF...');
      
      const { text } = await this.extractTextFromPDF(pdfBuffer);

      if (!text || text.trim().length === 0) {
        console.warn('No text extracted from PDF, returning empty data');
        return {
          text: '',
          extractedFields: {},
        };
      }
      const extractedFields = await this.extractFieldsWithLLM(text);

      return {
        text,
        extractedFields,
      };
    } catch (error) {
      console.error('Error processing PDF:', error);
      return {
        text: '',
        extractedFields: {},
      };
    }
  }


  private async extractFieldsWithLLM(text: string): Promise<Record<string, any>> {
    try {
      const systemPrompt = `You are an expert at extracting structured information from insurance claim documents and PDFs. 
Your task is to analyze the provided text and extract relevant information in a structured JSON format.

Extract the following information if available:
- policyNumber: Insurance policy number
- claimNumber: Claim reference number
- claimDate: Date when the claim was filed
- incidentDate: Date of the incident/accident
- vehicleNumber: Vehicle registration/license plate number
- vehicleModel: Make and model of the vehicle
- vehicleColor: Color of the vehicle
- vehicleYear: Year of the vehicle
- policyholderName: Name of the policyholder
- policyholderPhone: Contact phone number
- policyholderEmail: Email address
- claimAmount: Amount being claimed (if mentioned)
- damageDescription: Description of damage or incident
- accidentLocation: Location where accident occurred
- additionalInfo: Any other relevant key-value pairs found in the document

If a field is not found or cannot be determined, use null for that field.
Be thorough and extract all available information.`;

      const humanPrompt = `Extract structured information from the following PDF content:

{text}

You must respond with a valid JSON object matching this schema:
{{
  "policyNumber": "string or null",
  "claimNumber": "string or null",
  "claimDate": "string or null",
  "incidentDate": "string or null",
  "vehicleNumber": "string or null",
  "vehicleColor": "string or null",
  "vehicleModel": "string or null",
  "vehicleYear": "string or null",
  "policyholderName": "string or null",
  "policyholderPhone": "string or null",
  "policyholderEmail": "string or null",
  "claimAmount": "string or null",
  "damageDescription": "string or null",
  "accidentLocation": "string or null",
  "additionalInfo": {{}}
}}

Respond ONLY with the JSON object, no additional text or markdown formatting.`;

      const prompt = ChatPromptTemplate.fromMessages([
        SystemMessagePromptTemplate.fromTemplate(systemPrompt),
        HumanMessagePromptTemplate.fromTemplate(humanPrompt),
      ]);


      const chain = prompt.pipe(this.llm);
      const truncatedText = text.substring(0, 15000) + (text.length > 15000 ? '\n\n... (content truncated)' : '');
      const response = await chain.invoke({ text: truncatedText });
      

      let content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      

      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('No valid JSON found in LLM response, using empty object');
        return {};
      }

      const parsedResult = JSON.parse(jsonMatch[0]);


      try {
        const validatedResult = PDFExtractionSchema.parse(parsedResult);
        return validatedResult as Record<string, any>;
      } catch (validationError) {
        console.warn('Schema validation failed, returning parsed result:', validationError);
        return parsedResult as Record<string, any>;
      }
    } catch (error) {
      console.error('Error extracting fields with LLM:', error);
      return {};
    }
  }
}
