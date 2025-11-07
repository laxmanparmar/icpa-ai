import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';

export interface CarDetails {
  carColor: string | null;
  carModel: string | null;
  carNumber: string | null;
  damageArea: string | null;
  description: string | null;
}

export class ImageProcessor {
  private llm: ChatOpenAI;

  constructor(llm: ChatOpenAI) {
    this.llm = llm;
  }

  async processImage(imageBuffer: Buffer, imageFormat: string = 'image/jpeg'): Promise<CarDetails> {
    try {
      const base64Image = imageBuffer.toString('base64');
      const dataUrl = `data:${imageFormat};base64,${base64Image}`;

      const prompt = `Analyze this car image and extract the following information. Respond in JSON format with the exact keys shown below. If any information is not visible or cannot be determined, use null for that field.

      Please extract:
      1. carColor: The color of the car
      2. carModel: The make and model of the car (e.g., "Toyota Camry", "Honda Civic")
      3. carNumber: The license plate number or registration number
      4. damageArea: The area(s) of the car that show damage (e.g., "front bumper", "driver side door", "rear windshield")
      5. description: A detailed description of the damage and overall condition of the car

      Respond ONLY with valid JSON in this format:
      {
        "carColor": "string or null",
        "carModel": "string or null",
        "carNumber": "string or null",
        "damageArea": "string or null",
        "description": "string or null"
      }

      Analyze the image carefully and provide accurate information.`;

      const message = new HumanMessage({
        content: [
          {
            type: 'text',
            text: prompt,
          },
          {
            type: 'image_url',
            image_url: {
              url: dataUrl,
            },
          },
        ],
      });

      const response = await this.llm.invoke([message]);
      
      const content = response.content as string;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        console.warn('No JSON found in response, attempting to parse full content');
        throw new Error('Invalid response format from OpenAI');
      }

      const carDetails: CarDetails = JSON.parse(jsonMatch[0]);
      
      return {
        carColor: carDetails.carColor || null,
        carModel: carDetails.carModel || null,
        carNumber: carDetails.carNumber || null,
        damageArea: carDetails.damageArea || null,
        description: carDetails.description || null,
      };
    } catch (error) {
      console.error('Error processing image:', error);
      return {
        carColor: null,
        carModel: null,
        carNumber: null,
        damageArea: null,
        description: null,
      };
    }
  }
}

