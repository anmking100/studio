'use server';

/**
 * @fileOverview Task batching suggestion AI agent.
 *
 * - suggestTaskBatching - A function that handles the task batching suggestion process.
 * - SuggestTaskBatchingInput - The input type for the suggestTaskBatching function.
 * - SuggestTaskBatchingOutput - The return type for the suggestTaskBatching function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestTaskBatchingInputSchema = z.object({
  taskDescriptions: z.array(z.string()).describe('An array of task descriptions.'),
});
export type SuggestTaskBatchingInput = z.infer<typeof SuggestTaskBatchingInputSchema>;

const SuggestTaskBatchingOutputSchema = z.object({
  suggestedBatches: z.array(
    z.array(z.string()).describe('An array of task descriptions that can be batched together.')
  ).describe('Suggested task batches based on similarity.'),
});
export type SuggestTaskBatchingOutput = z.infer<typeof SuggestTaskBatchingOutputSchema>;

export async function suggestTaskBatching(input: SuggestTaskBatchingInput): Promise<SuggestTaskBatchingOutput> {
  return suggestTaskBatchingFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestTaskBatchingPrompt',
  input: {schema: SuggestTaskBatchingInputSchema},
  output: {schema: SuggestTaskBatchingOutputSchema},
  prompt: `You are an AI assistant designed to analyze task descriptions and suggest batches of similar tasks to improve focus and efficiency.

  Analyze the following task descriptions and suggest how they can be batched together based on similarity. Provide the output in JSON format.

  Task Descriptions:
  {{#each taskDescriptions}}
  - {{{this}}}
  {{/each}}`,
});

const suggestTaskBatchingFlow = ai.defineFlow(
  {
    name: 'suggestTaskBatchingFlow',
    inputSchema: SuggestTaskBatchingInputSchema,
    outputSchema: SuggestTaskBatchingOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
