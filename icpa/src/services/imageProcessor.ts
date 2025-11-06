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

  constructor(apiKey: string, modelName: string = 'gpt-4o') {
    this.llm = new ChatOpenAI({
      modelName,
      openAIApiKey: apiKey,
      temperature: 0,
      maxTokens: 1000,
    });
  }

  /**
   * Process an image and extract car details using OpenAI multi-language model
   * @param imageBuffer - Buffer containing the image data
   * @param imageFormat - Image format (e.g., 'image/jpeg', 'image/png')
   * @returns Car details extracted from the image
   */
  async processImage(imageBuffer: Buffer, imageFormat: string = 'image/jpeg'): Promise<CarDetails> {
    try {
      // Convert buffer to base64
      const base64Image = imageBuffer.toString('base64');
      const dataUrl = `data:${imageFormat};base64,${base64Image}`;

      // Create prompt for multi-language support
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
      
      // Parse the JSON response
      const content = response.content as string;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        console.warn('No JSON found in response, attempting to parse full content');
        throw new Error('Invalid response format from OpenAI');
      }

      const carDetails: CarDetails = JSON.parse(jsonMatch[0]);
      
      // Validate and clean the response
      return {
        carColor: carDetails.carColor || null,
        carModel: carDetails.carModel || null,
        carNumber: carDetails.carNumber || null,
        damageArea: carDetails.damageArea || null,
        description: carDetails.description || null,
      };
    } catch (error) {
      console.error('Error processing image:', error);
      // Return empty details on error
      return {
        carColor: null,
        carModel: null,
        carNumber: null,
        damageArea: null,
        description: null,
      };
    }
  }

  /**
   * Process multiple images
   * @param imageBuffers - Array of image buffers
   * @param imageFormat - Image format
   * @returns Array of car details
   */
  async processMultipleImages(
    imageBuffers: Buffer[],
    imageFormat: string = 'image/jpeg'
  ): Promise<CarDetails[]> {
    const results = await Promise.all(
      imageBuffers.map(buffer => this.processImage(buffer, imageFormat))
    );
    return results;
  }
}

