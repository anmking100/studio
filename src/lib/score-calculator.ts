
import type { CalculateFragmentationScoreInputType, CalculateFragmentationScoreOutput, GenericActivityItem } from '@/lib/types';

// Define thresholds for risk levels
const RISK_THRESHOLDS = {
  MODERATE: 2.0,
  HIGH: 3.5,
};

// Define weights for different factors
const FACTOR_WEIGHTS = {
  MEETING: 0.4, // Score per meeting
  JIRA_TASK_UPDATE: 0.15, // Score per Jira task update
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
  activitiesProcessed: number; // To track if any activities were processed
  [key: string]: number | boolean; // Allow other string keys
}

export function calculateScoreAlgorithmically(
  input: CalculateFragmentationScoreInputType
): CalculateFragmentationScoreOutput {
  const { userId, activities, activityWindowDays } = input;

  if (!activities || activities.length === 0) {
    return {
      userId,
      fragmentationScore: 0.5,
      summary: `No activities tracked for this period, reflecting low work-related fragmentation.`,
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

  // Sort activities by timestamp to correctly identify switches
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
    if (activity.source === 'jira' && activity.type.startsWith('jira_issue')) {
      score += FACTOR_WEIGHTS.JIRA_TASK_UPDATE;
      contributingFactors.jiraTaskUpdates++;
    }

    // Context Switches
    if (previousActivity) {
      if (activity.source !== previousActivity.source) {
        score += FACTOR_WEIGHTS.SOURCE_SWITCH;
        contributingFactors.sourceSwitches++;
      } else if (activity.type !== previousActivity.type && activity.type !== 'teams_presence_update' && previousActivity.type !== 'teams_presence_update') {
        // Don't count presence updates as type switches for this logic
        score += FACTOR_WEIGHTS.TYPE_SWITCH_SAME_SOURCE;
        contributingFactors.typeSwitches++;
      }
    }
    // Avoid counting presence updates as the "previous activity" for switch calculations if it's the only thing
    if (activity.type !== 'teams_presence_update') {
        previousActivity = activity;
    }
  }

  // Multi-platform usage
  const uniqueSources = new Set(activities.map(a => a.source));
  if (uniqueSources.size > 2) {
    score += FACTOR_WEIGHTS.MULTI_PLATFORM_USAGE_BONUS;
    contributingFactors.multiplePlatformsUsed = true;
  }
  
  // Activity Density
  if (activities.length > FACTOR_WEIGHTS.ACTIVITY_DENSITY_THRESHOLD * activityWindowDays) {
    score += FACTOR_WEIGHTS.ACTIVITY_DENSITY_BONUS;
    contributingFactors.highActivityDensityPeriods = 1; // Simplified
  }


  // Cap and round the score
  score = Math.min(5.0, Math.max(0.0, score));
  // If score is very low (e.g. from only a single, minor activity), but not zero-activity, ensure it's at least above the "no activity" score.
  if (activities.length > 0 && score < 0.6 && score > 0) { 
    score = Math.max(score, 0.6); // Ensure a minimal score if any activity exists
  } else if (activities.length > 0 && score === 0) { // If logic somehow results in 0 with activities
    score = 0.6;
  }


  const finalScore = parseFloat(score.toFixed(1));

  // Determine Risk Level
  let riskLevel: 'Low' | 'Moderate' | 'High';
  if (finalScore >= RISK_THRESHOLDS.HIGH) {
    riskLevel = 'High';
  } else if (finalScore >= RISK_THRESHOLDS.MODERATE) {
    riskLevel = 'Moderate';
  } else {
    riskLevel = 'Low';
  }

  // Generate Summary
  let summaryParts: string[] = [];
  if (finalScore === 0.5 && activities.length === 0) {
     summaryParts.push(`No activities tracked for this period, reflecting low work-related fragmentation.`);
  } else {
    if (contributingFactors.jiraTaskUpdates > 0) {
      summaryParts.push(`${contributingFactors.jiraTaskUpdates} Jira task activities`);
    }
    if (contributingFactors.meetings > 0) {
      summaryParts.push(`${contributingFactors.meetings} meeting(s)`);
    }
    if (contributingFactors.sourceSwitches > 0) {
      summaryParts.push(`${contributingFactors.sourceSwitches} platform switches`);
    }
    if (contributingFactors.typeSwitches > 0) {
      summaryParts.push(`${contributingFactors.typeSwitches} task type switches`);
    }
    if (contributingFactors.multiplePlatformsUsed) {
      summaryParts.push(`activity across ${uniqueSources.size} platforms`);
    }
    if (contributingFactors.highActivityDensityPeriods > 0) {
      summaryParts.push(`periods of high activity density`);
    }

    if (summaryParts.length === 0 && finalScore <= 1.0) {
        summaryParts.push("low overall activity levels.");
    } else if (summaryParts.length === 0 && finalScore > 1.0) {
        summaryParts.push("general activity patterns.");
    }
  }
  
  let summary = `Score of ${finalScore} (${riskLevel}). `;
  if (summaryParts.length > 0) {
     summary += "Key factors: " + summaryParts.join(', ') + ".";
  } else if (activities.length > 0) {
    summary += "Calculated based on general activity level."
  }


  return {
    userId,
    fragmentationScore: finalScore,
    summary,
    riskLevel,
    activitiesCount: activities.length,
  };
}
