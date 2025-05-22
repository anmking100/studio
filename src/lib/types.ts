

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'developer' | 'hr';
  avatarUrl?: string;
  // Optional: Store external system IDs if needed for direct API calls for this user
  jiraAccountId?: string; // This might be the email or a specific Jira ID
  teamsUserId?: string; // This is usually the MS Graph User ID
}

export interface FragmentationDataPoint {
  date: string; // YYYY-MM-DD
  score: number;
  summary?: string; // AI generated summary
  riskLevel?: 'Low' | 'Moderate' | 'High'; // AI assessed risk level
}

export interface TeamMemberFocus {
  id: string; // Microsoft Graph User ID
  name: string;
  email: string; // userPrincipalName from MS Graph
  role: 'developer' | 'hr'; // Derived or default
  avatarUrl?: string;

  // Fields for dynamically loaded AI scores based on fetched activities
  fragmentationScore?: number; // Can be undefined until calculated
  lastWeekTrend: number; // Mocked or calculated based on historical data later
  
  aiCalculatedScore?: number;
  aiSummary?: string;
  aiRiskLevel?: 'Low' | 'Moderate' | 'High';
  
  isLoadingScore: boolean;
  scoreError?: string | null;
  activities?: GenericActivityItem[]; // Store fetched activities
  activityError?: string | null; // Store errors from fetching activities
  isLoadingActivities?: boolean;
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

// Generic activity item for the new Genkit flow
export interface GenericActivityItem {
  type: string; // e.g., 'meeting', 'task_update', 'commit', 'chat_message', 'jira_issue_bug', 'teams_presence_update', 'teams_meeting'
  timestamp: string; // ISO 8601 datetime string
  details?: string; // Brief description
  source: 'teams' | 'jira' | 'm365' | 'github' | 'other'; // Source system
  // Potentially add: duration, participants, project, etc. depending on type
}

// Input for the fragmentation score calculation flow
export interface CalculateFragmentationScoreInputType {
  userId: string;
  activityWindowDays: number; // e.g., 7 for last 7 days
  activities: GenericActivityItem[];
}

// Output from the fragmentation score calculation flow
export interface CalculateFragmentationScoreOutputType {
  userId: string;
  fragmentationScore: number; // 0-5
  summary: string; // Explanation of the score
  riskLevel: 'Low' | 'Moderate' | 'High';
}
