
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'developer' | 'hr';
  avatarUrl?: string;
  // Optional: Store external system IDs if needed for direct API calls for this user
  jiraAccountId?: string;
  teamsUserId?: string;
}

export interface FragmentationDataPoint {
  date: string; // YYYY-MM-DD
  score: number;
  summary?: string; // AI generated summary
  riskLevel?: 'Low' | 'Moderate' | 'High'; // AI assessed risk level
}

export interface TeamMemberFocus extends User {
  fragmentationScore: number; // This will eventually be dynamically calculated
  lastWeekTrend: number; // e.g. -0.5, +1.2 (could also be calculated)
  overloadStatus: 'Stable' | 'At Risk' | 'Overloaded'; // Could be derived from score
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
  type: string; // e.g., 'meeting', 'task_update', 'commit', 'chat_message'
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
