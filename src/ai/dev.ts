
import { config } from 'dotenv';
config();

import '@/ai/flows/detect-fragmentation-anomalies.ts';
import '@/ai/flows/suggest-task-batching.ts';
// calculate-fragmentation-score.ts is no longer the primary method for score calculation
// but can be kept for other potential AI uses or reference.
// We are not importing it here to prevent Genkit from trying to run it if not needed.
// import '@/ai/flows/calculate-fragmentation-score.ts';
import '@/ai/flows/user-insights-flow.ts';

