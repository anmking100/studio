
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'developer' | 'hr';
  avatarUrl?: string;
  jiraAccountId?: string;
  teamsUserId?: string;
}

export interface CalculateFragmentationScoreOutput {
  userId: string;
  fragmentationScore: number;
  summary: string;
  riskLevel: 'Low' | 'Moderate' | 'High';
  activitiesCount: number;
}

export interface HistoricalScore {
  date: string; // YYYY-MM-DD format
  score: number;
  riskLevel: 'Low' | 'Moderate' | 'High';
  summary: string;
  activitiesCount: number;
  activityError?: string;
}


export interface TeamMemberFocus {
  id: string;
  name: string;
  email?: string;
  role: 'developer' | 'hr';
  avatarUrl?: string;

  currentDayScoreData?: CalculateFragmentationScoreOutput | null;

  historicalScores: HistoricalScore[];
  averageHistoricalScore?: number | null;

  isLoadingScore: boolean;
  scoreError?: string | null;
  activityError?: string | null;
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

// Definition for a raw Jira issue object
export interface JiraIssue {
  key: string;
  id: string;
  self: string;
  fields: {
    summary: string;
    status: {
      name: string;
      statusCategory?: {
        key?: string; // e.g., "new", "indeterminate", "done"
        name?: string;
      };
    };
    updated: string;
    created: string;
    issuetype: {
      name: string;
      iconUrl?: string;
    };
    priority?: {
      name: string;
      iconUrl?: string;
    };
    labels?: string[];
    assignee?: {
      displayName?: string;
      emailAddress?: string;
      accountId?: string;
    } | null;
    reporter?: {
      displayName?: string;
      emailAddress?: string;
      accountId?: string;
    };
    project?: {
      key?: string;
      name?: string;
    };
  };
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
  jiraStatusCategoryKey?: string;
}

export interface CalculateFragmentationScoreInputType {
  userId: string;
  activityWindowDays: number;
  activities: GenericActivityItem[];
}

export interface FragmentationDataPoint {
  date: string; // YYYY-MM-DD
  score: number;
  summary?: string;
  riskLevel?: 'Low' | 'Moderate' | 'High';
}

export interface UserActivityMetrics {
  userId: string;
  totalMeetingMinutes: number;
  averageResponseTimeMinutes: number | null; // Placeholder for now
  meetingCount: number;
  jiraTasksWorkedOnCount: number; // New field
  error?: string;
}

