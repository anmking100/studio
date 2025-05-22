import {NextRequest, NextResponse} from 'next/server';
import {getUserInsights, type UserInsightsInput} from '@/ai/flows/user-insights-flow';
import { calculateScoreAlgorithmically } from '@/lib/score-calculator';
import type { GenericActivityItem } from '@/lib/types';

// This is a simplified version. A more robust version would fetch user details and activities.
// For now, it expects the client to construct most of the UserInsightsInput.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Basic validation for the question and user identification
    if (!body.userId || !body.question) {
      return NextResponse.json({error: 'Missing required fields: userId and question'}, {status: 400});
    }

    // Construct UserInsightsInput
    // In a real scenario, you'd fetch MS Graph user, activities, and calculate score here based on userId.
    // For this version, we assume the client might send more complete data or we use defaults.
    const insightsInput: UserInsightsInput = {
      userId: body.userId,
      userName: body.userName || 'User', // Client should provide userName
      userRole: body.userRole,
      currentFragmentationScore: body.currentFragmentationScore,
      currentScoreSummary: body.currentScoreSummary,
      recentActivitiesSample: body.recentActivitiesSample,
      question: body.question,
    };

    // If score and summary are not provided, and activities are, we could calculate them.
    // For simplicity, this example assumes they might be provided or the AI handles missing data.
    // Example: If activities were provided in body.activities (as GenericActivityItem[])
    // and score/summary were missing:
    // if (body.activities && (insightsInput.currentFragmentationScore === undefined || insightsInput.currentScoreSummary === undefined)) {
    //   const scoreData = calculateScoreAlgorithmically({
    //     userId: insightsInput.userId,
    //     activities: body.activities as GenericActivityItem[],
    //     activityWindowDays: 1 // Or a relevant window
    //   });
    //   insightsInput.currentFragmentationScore = scoreData.fragmentationScore;
    //   insightsInput.currentScoreSummary = scoreData.summary;
    // }


    const insights = await getUserInsights(insightsInput);
    return NextResponse.json(insights);

  } catch (error: any) {
    console.error('Error in chatbot API:', error);
    let errorMessage = 'Failed to get insights.';
    if (error.message) {
        errorMessage = error.message;
    }
    if (error.cause && typeof error.cause === 'object' && 'message' in error.cause) {
        errorMessage = error.cause.message as string;
    }
    return NextResponse.json({error: 'Failed to get insights from AI.', details: errorMessage}, {status: 500});
  }
}
