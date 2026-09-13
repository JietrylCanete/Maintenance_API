const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

const aiService = {
    async classifyMaintenance(title, description, location) {

        const prompt = `
You are an AI assistant for a school maintenance request system.

Analyze the following maintenance request.

Title:
${title}

Description:
${description}

Location:
${location}

Classify the maintenance request using ONLY one category from:

- Electrical
- Plumbing
- HVAC
- Furniture
- Building
- Network/IT
- Cleaning
- Other

Assign ONLY one priority:

- Low
- Medium
- High
- Critical

Priority guidelines:

Low:
Minor issue with little effect on school operations.

Medium:
Issue should be addressed but does not significantly disrupt school operations.

High:
Issue significantly affects a classroom, office, facility, or school activity.

Critical:
Issue creates an immediate safety risk or could cause serious damage.

Return a short explanation for the selected category and priority.

Return ONLY valid JSON using exactly this structure:

{
  "category": "Electrical",
  "priority": "High",
  "reason": "Short explanation"
}
`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash-lite',
            contents: prompt,
            config: {
                responseMimeType: 'application/json'
            }
        });

        const result = JSON.parse(response.text);

        const validCategories = [
            'Electrical',
            'Plumbing',
            'HVAC',
            'Furniture',
            'Building',
            'Network/IT',
            'Cleaning',
            'Other'
        ];

        const validPriorities = [
            'Low',
            'Medium',
            'High',
            'Critical'
        ];

        if (!validCategories.includes(result.category)) {
            throw new Error(`Invalid AI category: ${result.category}`);
        }

        if (!validPriorities.includes(result.priority)) {
            throw new Error(`Invalid AI priority: ${result.priority}`);
        }

        if (!result.reason || typeof result.reason !== 'string') {
            throw new Error('Invalid AI reason.');
        }

        return {
            category: result.category,
            priority: result.priority,
            reason: result.reason
        };
    }
};

module.exports = aiService;