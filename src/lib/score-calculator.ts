
import type { CalculateFragmentationScoreInputType, CalculateFragmentationScoreOutput, GenericActivityItem } from '@/lib/types';

// Define thresholds for risk levels
const RISK_THRESHOLDS = {
  MODERATE: 2.0,
  HIGH: 3.5,
};

// Define weights for different factors
const FACTOR_WEIGHTS = {
  MEETING: 0.4, 
  JIRA_TASK_UPDATE: 1.0, 
  SOURCE_SWITCH: 0.25, 
  TYPE_SWITCH_SAME_SOURCE: 0.1,
  MULTI_PLATFORM_USAGE_BONUS: 0.5, 
  ACTIVITY_DENSITY_THRESHOLD: 5, 
  ACTIVITY_DENSITY_BONUS: 0.3,
};

interface ContributingFactors {
  meetings: number;
  jiraTaskUpdates: number;
  jiraCompletedTasksNotScored: number; // New counter
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
      fragmentationScore: 0.0, // Changed from 0.5 to 0.0 for no activity
      summary: `No activities tracked for this period.`,
      riskLevel: 'Low',
      activitiesCount: 0,
    };
  }

  let score = 0.0;
  const contributingFactors: ContributingFactors = {
    meetings: 0,
    jiraTaskUpdates: 0,
    jiraCompletedTasksNotScored: 0,
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
    if (activity.source === 'jira' && activity.type.startsWith('jira_issue')) {
      console.log(`SCORE_CALC: Processing Jira activity for user ${userId}: ${activity.details}, Status Category: ${activity.jiraStatusCategoryKey}`);
      contributingFactors.jiraTaskUpdates++; // Count all processed Jira activities

      if (activity.jiraStatusCategoryKey === 'done') {
        console.log(`SCORE_CALC: Jira task ${activity.details} is 'done', not adding to score.`);
        contributingFactors.jiraCompletedTasksNotScored++;
      } else {
        score += FACTOR_WEIGHTS.JIRA_TASK_UPDATE;
        console.log(`SCORE_CALC: Added ${FACTOR_WEIGHTS.JIRA_TASK_UPDATE} for active Jira task ${activity.details}. Current raw score: ${score}`);
      }
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
    if (activity.type !== 'teams_presence_update') {
        previousActivity = activity;
    }
  }

  const uniqueSources = new Set(activities.map(a => a.source));
  if (uniqueSources.size > 2) {
    score += FACTOR_WEIGHTS.MULTI_PLATFORM_USAGE_BONUS;
    contributingFactors.multiplePlatformsUsed = true;
  }
  
  if (activities.length > FACTOR_WEIGHTS.ACTIVITY_DENSITY_THRESHOLD * activityWindowDays) { 
    score += FACTOR_WEIGHTS.ACTIVITY_DENSITY_BONUS;
    contributingFactors.highActivityDensityPeriods = 1; 
  }

  // Nudge score up if there's activity but score is still very low, but ensure it's above 0.0 for actual activity
  if (activities.length > 0 && score <= 0.0) { // If activities exist but score is 0 or less (unlikely unless all tasks were 'done' with 0 other factors)
      score = 0.1; // Minimal score to indicate some processing happened
  } else if (activities.length > 0 && score > 0 && score < 0.6) {
    score = 0.6;
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
    const activeJiraTasks = contributingFactors.jiraTaskUpdates - contributingFactors.jiraCompletedTasksNotScored;
    if (activeJiraTasks > 0) {
      summaryParts.push(`${activeJiraTasks} active Jira task activit${activeJiraTasks === 1 ? 'y' : 'ies'}`);
    }
    if (contributingFactors.jiraCompletedTasksNotScored > 0) {
      summaryParts.push(`${contributingFactors.jiraCompletedTasksNotScored} completed Jira task(s) processed (not scored)`);
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

    if (summaryParts.length === 0 && finalScore <= 1.0 && finalScore >= 0.0) { 
        summaryParts.push("low overall activity levels.");
    } else if (summaryParts.length === 0 && finalScore > 1.0) {
        summaryParts.push("general activity patterns.");
    }
  }
  
  let summary = `Score of ${finalScore} (${riskLevel}). `;
  if (summaryParts.length > 0 && !(finalScore === 0.0 && activities.length === 0)) { 
     summary += "Key factors: " + summaryParts.join(', ') + ".";
  } else if (activities.length > 0 && finalScore >= 0.0) { 
    summary += "Calculated based on general activity level."
  } else if (finalScore === 0.0 && activities.length === 0) {
    // Summary part "No activities..." already covers this.
  }


  return {
    userId,
    fragmentationScore: finalScore,
    summary,
    riskLevel,
    activitiesCount: activities.length,
  };
}

