
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
      summary: `No activities tracked for the ${activityWindowDays}-day period, reflecting low work-related fragmentation.`,
      riskLevel: 'Low',
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
    previousActivity = activity;
  }

  // Multi-platform usage
  const uniqueSources = new Set(activities.map(a => a.source));
  if (uniqueSources.size > 2) {
    score += FACTOR_WEIGHTS.MULTI_PLATFORM_USAGE_BONUS;
    contributingFactors.multiplePlatformsUsed = true;
  }
  
  // Activity Density (simple check: count periods with many activities)
  // This is a basic example; a more sophisticated approach would analyze time blocks.
  if (activities.length / activityWindowDays > FACTOR_WEIGHTS.ACTIVITY_DENSITY_THRESHOLD * 24 / 8) { // Pro-rata for an 8-hour workday
     // Example: if more than 5 activities per "effective" work day average
     // This logic is very simplistic and could be refined. For now, consider it based on daily average.
    if(activities.length > FACTOR_WEIGHTS.ACTIVITY_DENSITY_THRESHOLD * activityWindowDays){
        score += FACTOR_WEIGHTS.ACTIVITY_DENSITY_BONUS;
        contributingFactors.highActivityDensityPeriods = 1; // Simplified
    }
  }


  // Cap and round the score
  score = Math.min(5.0, Math.max(0.0, score));
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
  if (finalScore === 0.5 && activities.length === 0) { // Handled at the start
     summaryParts.push(`No activities tracked for the ${activityWindowDays}-day period, reflecting low work-related fragmentation.`);
  } else {
    if (contributingFactors.meetings > 0) {
      summaryParts.push(`${contributingFactors.meetings} meeting(s)`);
    }
    if (contributingFactors.jiraTaskUpdates > 0) {
      summaryParts.push(`${contributingFactors.jiraTaskUpdates} Jira task activities`);
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
      summaryParts.push(`high activity density`);
    }

    if (summaryParts.length === 0 && finalScore <= 1.0) {
        summaryParts.push("Low overall activity.");
    } else if (summaryParts.length === 0 && finalScore > 1.0) {
        summaryParts.push("Score based on general activity patterns.");
    }
  }
  
  let summary = `Score of ${finalScore} (${riskLevel}). `;
  if (summaryParts.length > 0) {
     summary += "Key factors: " + summaryParts.slice(0, 3).join(', ') + ".";
  } else if (activities.length > 0) {
    summary += "Calculated based on general activity level and patterns."
  }


  return {
    userId,
    fragmentationScore: finalScore,
    summary,
    riskLevel,
  };
}
