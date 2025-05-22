
'use server';
/**
 * @fileOverview Calculates a cognitive fragmentation score based on user activity data.
 *
 * - calculateFragmentationScore - A function that calculates the score.
 * - CalculateFragmentationScoreInput - The input type.
 * - CalculateFragmentationScoreOutput - The return type.
 */

import {ai} from '@/ai/genkit';
import {z} from 'zod';

// Define more specific activity types as integrations are built
const GenericActivityItemSchema = z.object({
  type: z.string().describe("Type of activity, e.g., 'meeting', 'task_update', 'pull_request'"),
  timestamp: z.string().datetime().describe("When the activity occurred"),
  details: z.string().optional().describe("Brief details about the activity"),
  source: z.enum(["teams", "jira", "m365", "other"]).describe("Source of the activity data")
});

// Schema is NOT exported directly
const CalculateFragmentationScoreInputSchema = z.object({
  userId: z.string().describe("The ID of the user whose activity is being analyzed."),
  activityWindowDays: z.number().default(7).describe("The number of days of activity to consider (e.g., last 7 days)."),
  activities: z.array(GenericActivityItemSchema).describe("A list of user activities from various sources like Teams, Jira, etc."),
});
export type CalculateFragmentationScoreInput = z.infer<typeof CalculateFragmentationScoreInputSchema>;

// Schema is NOT exported directly
const CalculateFragmentationScoreOutputSchema = z.object({
  userId: z.string().describe("The ID of the user."),
  fragmentationScore: z.number().min(0).max(5).describe("Calculated cognitive fragmentation score (0-5, higher is more fragmented)."),
  summary: z.string().describe("A brief explanation of the score, highlighting key contributing factors."),
  riskLevel: z.enum(["Low", "Moderate", "High"]).describe("Assessed risk level based on the score."),
});
export type CalculateFragmentationScoreOutput = z.infer<typeof CalculateFragmentationScoreOutputSchema>;

export async function calculateFragmentationScore(
  input: CalculateFragmentationScoreInput
): Promise<CalculateFragmentationScoreOutput> {
  return calculateFragmentationScoreFlow(input);
}

const prompt = ai.definePrompt({
  name: 'calculateFragmentationScorePrompt',
  input: {schema: CalculateFragmentationScoreInputSchema},
  output: {schema: CalculateFragmentationScoreOutputSchema},
  prompt: `You are an expert in analyzing workforce productivity and cognitive load.
Your task is to calculate a Cognitive Fragmentation Score for a user based on their recent activities.
The score should range from 0 (very low fragmentation, highly focused) to 5 (very high fragmentation, severely scattered attention).

User ID: {{{userId}}}
Activity Window: Last {{{activityWindowDays}}} days.

Activities:
{{#if activities.length}}
  {{#each activities}}
  - Source: {{{source}}}, Type: {{{type}}}, Time: {{{timestamp}}}{{#if details}}, Details: {{{details}}}{{/if}}
  {{/each}}
{{else}}
  No specific activities provided. Consider this when scoring.
{{/if}}

Consider the following factors when calculating the score:
- Number of context switches (e.g., frequent back-and-forth between Jira tasks and Teams meetings).
- Density of meetings and their impact on focused work blocks.
- Number of active tasks or projects being juggled simultaneously.
- Interruptions (implied by frequent, short-duration activities across different platforms).
- Late-night or weekend activity (if discernible from timestamps, could indicate work-life imbalance contributing to fragmentation).

Based on the score, determine a risk level:
- Low: 0 - 1.9
- Moderate: 2.0 - 3.4
- High: 3.5 - 5.0

Output:
Return a JSON object with 'userId', 'fragmentationScore' (float, 1 decimal place), 'summary' (a concise explanation for the score, mentioning key drivers), and 'riskLevel'.
Ensure the score is strictly between 0 and 5.
If no activities are provided, assign a baseline score reflecting uncertainty, perhaps in the low-moderate range (e.g., 2.0), and note the lack of data in the summary.
Always use dot notation, never exponential notation for floating point numbers.
`,
});

const calculateFragmentationScoreFlow = ai.defineFlow(
  {
    name: 'calculateFragmentationScoreFlow',
    inputSchema: CalculateFragmentationScoreInputSchema,
    outputSchema: CalculateFragmentationScoreOutputSchema,
  },
  async (input) => {
    console.log(`Calculating fragmentation score for user: ${input.userId} with ${input.activities.length} activities.`);
    const {output} = await prompt(input);

    if (!output) {
        console.error(`LLM did not return a structured (or parsable) output for calculateFragmentationScoreFlow. UserID: ${input.userId}. Input activities count: ${input.activities.length}. Input details:`, JSON.stringify(input, null, 2));
        const risk = input.activities.length === 0 ? "Moderate" : "High";
        const score = input.activities.length === 0 ? 2.0 : 4.0;
        return {
            userId: input.userId,
            fragmentationScore: score,
            summary: "Could not reliably calculate fragmentation score: AI model did not return a valid structured output. A default score has been assigned based on activity count.",
            riskLevel: risk as "Low" | "Moderate" | "High",
        };
    }

    let finalScore: number;
    let currentSummary = output.summary;
    let currentRiskLevel = output.riskLevel;

    if (typeof output.fragmentationScore === 'number' && !isNaN(output.fragmentationScore)) {
        finalScore = parseFloat(Math.min(5, Math.max(0, output.fragmentationScore)).toFixed(1));
        if (isNaN(finalScore)) { // Check if toFixed or parseFloat resulted in NaN
            console.error(`Score parsing resulted in NaN for user: ${input.userId}. Original score: ${output.fragmentationScore}. Using default score 3.0.`);
            finalScore = 3.0; // Fallback score
            currentSummary = `AI returned a score (${output.fragmentationScore}) that led to a calculation error. Default score ${finalScore} assigned. Original summary: ${output.summary || 'N/A'}`;
            currentRiskLevel = finalScore <= 1.9 ? "Low" : finalScore <= 3.4 ? "Moderate" : "High";
        }
    } else {
        console.error(`LLM returned an invalid or non-numeric fragmentationScore: '${output.fragmentationScore}' (type: ${typeof output.fragmentationScore}) for user: ${input.userId}. Using default score 2.5.`);
        finalScore = 2.5; // Default score due to invalid type
        currentSummary = `AI model returned an invalid score value ('${output.fragmentationScore}'). Default score ${finalScore} assigned. Original summary: ${output.summary || 'N/A'}`;
        currentRiskLevel = finalScore <= 1.9 ? "Low" : finalScore <= 3.4 ? "Moderate" : "High";
    }
    
    // Final sanity check for NaN score
    if (isNaN(finalScore)) {
        console.error(`Critical: Final score is NaN for userId: ${input.userId}. Hard fallback to 2.0. Investigate immediately.`);
        finalScore = 2.0; 
        currentSummary = `Score calculation resulted in NaN. A hard fallback score of ${finalScore} was assigned. Original summary: ${output.summary || 'N/A'}`;
        currentRiskLevel = "Moderate";
    }

    return {
      userId: input.userId, // Always use the input userId
      fragmentationScore: finalScore,
      summary: currentSummary,
      riskLevel: currentRiskLevel,
    };
  }
);

