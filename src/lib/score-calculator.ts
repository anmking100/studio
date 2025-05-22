
import type { CalculateFragmentationScoreInputType, CalculateFragmentationScoreOutput, GenericActivityItem } from '@/lib/types';

// Define thresholds for risk levels
const RISK_THRESHOLDS = {
  MODERATE: 2.0,
  HIGH: 3.5,
};

// Define weights for different factors
const FACTOR_WEIGHTS = {
  MEETING: 0.4, // Score per meeting
  JIRA_TASK_UPDATE: 1.0, // Score per Jira task update - UPDATED from 0.4
  SOURCE_SWITCH: 0.25, // Score per switch between different sources (e.g., Jira to Teams)
  TYPE_SWITCH_SAME_SOURCE: 0.1, // Score per switch between different activity types within the same source
  MULTI_PLATFORM_USAGE_BONUS: 0.5, // Bonus if > 2 sources are used
  ACTIVITY_DENSITY_THRESHOLD: 5, // If more than 5 activities in an hour, add bonus
  ACTIVITY_DENSITY_BONUS: 0.3,
};

interface ContributingFactors {
  meetings: number;
  jiraTaskUpdates: number;
  sourceSwitches: number;
  typeSwitches: number;
  multiplePlatformsUsed: boolean;
  highActivityDensityPeriods: number;
  activitiesProcessed: number;
  [key: string]: number | boolean;
}

export function calculateScoreAlgorithmically(
  input: CalculateFragmentationScoreInputType
): CalculateFragmentationScoreOutput {
  const { userId, activities, activityWindowDays } = input;

  if (!activities || activities.length === 0) {
    return {
      userId,
      fragmentationScore: 0.0,
      summary: `No activities tracked for this period.`,
      riskLevel: 'Low',
      activitiesCount: 0,
    };
  }

  let score = 0.0;
  const contributingFactors: ContributingFactors = {
    meetings: 0,
    jiraTaskUpdates: 0,
    sourceSwitches: 0,
    typeSwitches: 0,
    multiplePlatformsUsed: false,
    highActivityDensityPeriods: 0,
    activitiesProcessed: activities.length,
  };

  const sortedActivities = [...activities].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  let previousActivity: GenericActivityItem | null = null;

  for (const activity of sortedActivities) {
    // Meetings
    if (activity.type === 'teams_meeting') {
      score += FACTOR_WEIGHTS.MEETING;
      contributingFactors.meetings++;
    }

    // Jira Task Updates
    // THIS IS WHERE JIRA DATA IS USED FOR SCORING
    if (activity.source === 'jira' && activity.type.startsWith('jira_issue')) {
      console.log(`SCORE_CALC: Processing Jira activity for user ${userId}: ${activity.details}`);
      score += FACTOR_WEIGHTS.JIRA_TASK_UPDATE;
      contributingFactors.jiraTaskUpdates++;
    }

    // Context Switches
    if (previousActivity) {
      if (activity.source !== previousActivity.source) {
        score += FACTOR_WEIGHTS.SOURCE_SWITCH;
        contributingFactors.sourceSwitches++;
      } else if (activity.type !== previousActivity.type && activity.type !== 'teams_presence_update' && previousActivity.type !== 'teams_presence_update') {
        score += FACTOR_WEIGHTS.TYPE_SWITCH_SAME_SOURCE;
        contributingFactors.typeSwitches++;
      }
    }
    // Only update previousActivity if it's not a presence update, to avoid presence updates masking actual task switches
    if (activity.type !== 'teams_presence_update') {
        previousActivity = activity;
    }
  }

  const uniqueSources = new Set(activities.map(a => a.source));
  if (uniqueSources.size > 2) {
    score += FACTOR_WEIGHTS.MULTI_PLATFORM_USAGE_BONUS;
    contributingFactors.multiplePlatformsUsed = true;
  }
  
  // Adjust activity density calculation for the window
  // This simple check scales the threshold by the number of days in the window.
  // A more sophisticated approach might look at activities per hour or specific time blocks.
  if (activities.length > FACTOR_WEIGHTS.ACTIVITY_DENSITY_THRESHOLD * activityWindowDays) { 
    score += FACTOR_WEIGHTS.ACTIVITY_DENSITY_BONUS;
    contributingFactors.highActivityDensityPeriods = 1; // Simplified: flag if overall density is high
  }

  // Nudge score up if there's activity but score is still very low (e.g. only presence updates)
  // Ensure it's differentiated from a true "no activity" score of 0.0.
  // Changed: if score is 0 but activities exist, bump to a minimal 0.1
  if (activities.length > 0 && score > 0 && score < 0.1) { 
    score = 0.1; 
  } else if (activities.length > 0 && score === 0.0) { 
    score = 0.1; 
  }


  const finalScore = parseFloat(Math.min(5.0, Math.max(0.0, score)).toFixed(1));

  let riskLevel: 'Low' | 'Moderate' | 'High';
  if (finalScore >= RISK_THRESHOLDS.HIGH) {
    riskLevel = 'High';
  } else if (finalScore >= RISK_THRESHOLDS.MODERATE) {
    riskLevel = 'Moderate';
  } else {
    riskLevel = 'Low';
  }

  let summaryParts: string[] = [];
  if (finalScore === 0.0 && activities.length === 0) {
     summaryParts.push(`No activities tracked for this period.`);
  } else {
    if (contributingFactors.jiraTaskUpdates > 0) {
      summaryParts.push(`${contributingFactors.jiraTaskUpdates} Jira task activit${contributingFactors.jiraTaskUpdates === 1 ? 'y' : 'ies'}`);
    }
    if (contributingFactors.meetings > 0) {
      summaryParts.push(`${contributingFactors.meetings} meeting(s)`);
    }
    if (contributingFactors.sourceSwitches > 0) {
      summaryParts.push(`${contributingFactors.sourceSwitches} platform switch${contributingFactors.sourceSwitches === 1 ? '' : 'es'}`);
    }
    if (contributingFactors.typeSwitches > 0) {
      summaryParts.push(`${contributingFactors.typeSwitches} task type switch${contributingFactors.typeSwitches === 1 ? '' : 'es'}`);
    }
    if (contributingFactors.multiplePlatformsUsed) {
      summaryParts.push(`activity across ${uniqueSources.size} platforms`);
    }
    if (contributingFactors.highActivityDensityPeriods > 0) {
      summaryParts.push(`periods of high activity density`);
    }

    // Default summary part if others are empty but score is not minimal for zero activity
    if (summaryParts.length === 0 && finalScore <= 1.0 && finalScore >= 0.0) { // Adjusted to include 0.0 if activities > 0
        summaryParts.push("low overall activity levels.");
    } else if (summaryParts.length === 0 && finalScore > 1.0) {
        summaryParts.push("general activity patterns.");
    }
  }
  
  let summary = `Score of ${finalScore} (${riskLevel}). `;
  if (summaryParts.length > 0 && !(finalScore === 0.0 && activities.length === 0)) { 
     summary += "Key factors: " + summaryParts.join(', ') + ".";
  } else if (activities.length > 0 && finalScore >= 0.0) { // For cases where activities are present but don't trigger specific summary parts (e.g. only presence updates)
    summary += "Calculated based on general activity level."
  } else if (finalScore === 0.0 && activities.length === 0) {
    // The initial summary part "No activities..." already covers this.
  }


  return {
    userId,
    fragmentationScore: finalScore,
    summary,
    riskLevel,
    activitiesCount: activities.length,
  };
}
