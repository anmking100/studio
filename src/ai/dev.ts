
import { config } from 'dotenv';
config();

import '@/ai/flows/detect-fragmentation-anomalies.ts';
import '@/ai/flows/suggest-task-batching.ts';
import '@/ai/flows/calculate-fragmentation-score.ts';
