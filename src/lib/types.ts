
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
  id: string; // Usually the same as key for older issues, but good to have
  self: string; // API link to the issue
  fields: {
    summary: string;
    status: {
      name: string;
      statusCategory?: {
        key?: string;
        name?: string;
      };
    };
    updated: string; // ISO 8601 datetime string
    created: string; // ISO 8601 datetime string
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
    // Add any other fields you might want to inspect from the raw response
    // For example:
    // description?: any; // Can be complex Atlassian Document Format
    // comments?: { comments: any[]; maxResults: number; total: number; startAt: number; };
  };
  // You can add more top-level fields if needed, e.g., changelog for history
  // changelog?: { histories: any[] };
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
  activityWindowDays: number;
  activities: GenericActivityItem[];
}

export interface FragmentationDataPoint {
  date: string; // YYYY-MM-DD
  score: number;
  summary?: string;
  riskLevel?: 'Low' | 'Moderate' | 'High';
}
