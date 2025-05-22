'use server';

/**
 * @fileOverview Detects anomalies in cognitive fragmentation score and alerts the user.
 *
 * - detectFragmentationAnomalies - A function that detects anomalies in cognitive fragmentation score.
 * - DetectFragmentationAnomaliesInput - The input type for the detectFragmentationAnomalies function.
 * - DetectFragmentationAnomaliesOutput - The return type for the detectFragmentationAnomalies function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DetectFragmentationAnomaliesInputSchema = z.object({
  fragmentationScores: z
    .array(z.number())
    .describe('An array of cognitive fragmentation scores over time.'),
  threshold: z
    .number()
    .default(2.0)
    .describe(
      'The threshold for detecting anomalies. A score exceeding this multiple of the standard deviation is considered an anomaly.'
    ),
});
export type DetectFragmentationAnomaliesInput = z.infer<
  typeof DetectFragmentationAnomaliesInputSchema
>;

const DetectFragmentationAnomaliesOutputSchema = z.object({
  isAnomaly: z.boolean().describe('Whether an anomaly is detected.'),
  anomalyIndex: z
    .number()
    .optional()
    .describe('The index of the anomaly, if any.'),
  message: z.string().describe('A message describing the anomaly, if any.'),
});
export type DetectFragmentationAnomaliesOutput = z.infer<
  typeof DetectFragmentationAnomaliesOutputSchema
>;

export async function detectFragmentationAnomalies(
  input: DetectFragmentationAnomaliesInput
): Promise<DetectFragmentationAnomaliesOutput> {
  return detectFragmentationAnomaliesFlow(input);
}

const detectFragmentationAnomaliesPrompt = ai.definePrompt({
  name: 'detectFragmentationAnomaliesPrompt',
  input: {schema: DetectFragmentationAnomaliesInputSchema},
  output: {schema: DetectFragmentationAnomaliesOutputSchema},
  prompt: `You are an expert in detecting anomalies in time series data.

  Given a series of cognitive fragmentation scores: {{{fragmentationScores}}}
  and a threshold of {{{threshold}}},
  determine if there is a significant anomaly (spike) in the scores.

  The larger the fragmentation score, the more fragmented the user's attention is. Therefore, a large spike should be flagged as an anomaly.

  Consider an anomaly to be present if a score exceeds the average score plus the (standard deviation * threshold).

  If an anomaly is detected, provide the index of the anomaly in the series and a message describing the anomaly.
  If no anomaly is detected, indicate that no anomaly was found.
  Always use dot notation, never exponential notation for floating point numbers.

  Return a JSON object with the following format:
  {
    "isAnomaly": true or false,
    "anomalyIndex": index of the anomaly (if any),
    "message": "A message describing the anomaly (if any)"
  }
  `,
});

const detectFragmentationAnomaliesFlow = ai.defineFlow(
  {
    name: 'detectFragmentationAnomaliesFlow',
    inputSchema: DetectFragmentationAnomaliesInputSchema,
    outputSchema: DetectFragmentationAnomaliesOutputSchema,
  },
  async input => {
    // Calculate mean and standard deviation
    const mean =
      input.fragmentationScores.reduce((a, b) => a + b, 0) /
      input.fragmentationScores.length;

    const sumOfSquares = input.fragmentationScores.reduce(
      (a, b) => a + Math.pow(b - mean, 2),
      0
    );
    const stdDev = Math.sqrt(sumOfSquares / input.fragmentationScores.length);

    let anomalyIndex = -1;
    for (let i = 0; i < input.fragmentationScores.length; i++) {
      if (input.fragmentationScores[i] > mean + stdDev * input.threshold) {
        anomalyIndex = i;
        break;
      }
    }

    let output: DetectFragmentationAnomaliesOutput;

    if (anomalyIndex !== -1) {
      output = {
        isAnomaly: true,
        anomalyIndex: anomalyIndex,
        message:
          `Anomaly detected at index ${anomalyIndex} with a score of ${input.fragmentationScores[anomalyIndex]}. ` +
          `This exceeds the threshold of ${input.threshold} standard deviations from the mean.`,
      };
    } else {
      output = {
        isAnomaly: false,
        message: 'No anomaly detected.',
      };
    }

    return output;
  }
);
