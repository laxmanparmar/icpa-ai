export const systemPromptForPolicyDocumentExtraction = `You are an expert at extracting structured information from this police report documents and PDFs. 
Your task is to analyze the provided text and extract relevant information in a structured JSON format.

Extract the following information if available:
- incidentDate: Date of the incident/accident convert it to YYYY-MM-DD format
- vehicleNumber: Vehicle registration/license plate number
- vehicleModel: Make and model of the vehicle
- vehicleColor: Color of the vehicle
- vehicleYear: Year of the vehicle
- policyholderName: Name of the policyholder
- policyholderLicenseNumber: Driver's license number
- policyholderAddress: Address of the policyholder
- damageDescription: Description of damage or incident
- accidentLocation: Location where accident occurred
- additionalInfo: Any other relevant key-value pairs found in the document

If a field is not found or cannot be determined, use null for that field.
Be thorough and extract all available information.`;

export const humanPromptForPolicyDocumentExtraction = `Extract structured information from the following PDF content:

{text}

You must respond with a valid JSON object matching this schema:
{{
  "incidentDate": "string or null",
  "vehicleNumber": "string or null",
  "vehicleColor": "string or null",
  "vehicleModel": "string or null",
  "vehicleYear": "string or null",
  "policyholderName": "string or null",
  "policyholderLicenseNumber": "string or null",
  "policyholderAddress": "string or null",
  "damageDescription": "string or null",
  "accidentLocation": "string or null",
  "additionalInfo": {{}}
}}

Respond ONLY with the JSON object, no additional text or markdown formatting.`;