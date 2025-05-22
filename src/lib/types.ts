
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'developer' | 'hr';
  avatarUrl?: string;
  jiraAccountId?: string;
  teamsUserId?: string;
}

export interface HistoricalScore {
  date: string; // YYYY-MM-DD format
  score: number; // This will now be the AVERAGE score for the day
  riskLevel: 'Low' | 'Moderate' | 'High'; // Based on the average score
  summary: string; // Summary for the day
  activitiesCount: number; // Total activities for the day (sum of intervals)
  intervalScoresCount?: number; // Number of 2-hour intervals that contributed to the average
}

export interface CalculateFragmentationScoreOutput {
  userId: string;
  fragmentationScore: number;
  summary: string;
  riskLevel: 'Low' | 'Moderate' | 'High';
  activitiesCount: number; 
}

export interface TeamMemberFocus {
  id: string;
  name: string;
  email?: string;
  role: 'developer' | 'hr';
  avatarUrl?: string;

  currentDayScoreData?: CalculateFragmentationScoreOutput | null; // This will store the average score for the selected end date

  historicalScores: HistoricalScore[]; // These will also store daily averages
  averageHistoricalScore?: number | null; // Average of the daily average historical scores

  isLoadingScore: boolean;
  scoreError?: string | null;
  activityError?: string | null; // Kept for broader activity fetching issues
  isLoadingActivities?: boolean; // Might be true for a longer time now
}

export interface Task {
  id: string;
  description: string;
}

export interface MicrosoftGraphLicense {
  skuId: string;
  disabledPlans: string[];
}
export interface MicrosoftGraphUser {
  id:string;
  displayName: string | null;
  userPrincipalName: string;
  assignedLicenses: MicrosoftGraphLicense[];
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  avatarUrl?: string; 
}

export interface GenericActivityItem {
  type: string;
  timestamp: string;
  details?: string;
  source: 'teams' | 'jira' | 'm365' | 'github' | 'other';
  durationMinutes?: number;
}

export interface CalculateFragmentationScoreInputType {
  userId: string;
  activityWindowDays: number; // This might be less relevant if we always calc for specific intervals
  activities: GenericActivityItem[];
}

// For dashboard page - personal score display (less complex than team member)
export interface FragmentationDataPoint {
  date: string; // YYYY-MM-DD
  score: number;
  summary?: string;
  riskLevel?: 'Low' | 'Moderate' | 'High';
}

