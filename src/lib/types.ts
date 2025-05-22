
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
  date: string;
  score: number;
  riskLevel?: 'Low' | 'Moderate' | 'High';
  summary?: string;
}

export interface TeamMemberFocus {
  id: string; 
  name: string;
  email: string; 
  role: 'developer' | 'hr'; 
  avatarUrl?: string;

  // Current day's calculated score and details
  currentDayScoreData?: CalculateFragmentationScoreOutput | null;

  // Historical scores
  historicalScores?: HistoricalScore[];
  averageHistoricalScore?: number | null;
  
  isLoadingScore: boolean; // True if current or historical scores are being processed
  scoreError?: string | null; // General error for the member's data processing
  activityError?: string | null; 
  isLoadingActivities?: boolean; 

  // Individual activities are not stored on this top-level object anymore to avoid clutter,
  // they are fetched and processed per day for historical data or for current score.
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

export interface GenericActivityItem {
  type: string; 
  timestamp: string; 
  details?: string; 
  source: 'teams' | 'jira' | 'm365' | 'github' | 'other'; 
}

export interface CalculateFragmentationScoreInputType {
  userId: string;
  activityWindowDays: number; 
  activities: GenericActivityItem[];
}

export interface CalculateFragmentationScoreOutput {
  userId: string;
  fragmentationScore: number; 
  summary: string; 
  riskLevel: 'Low' | 'Moderate' | 'High';
}

// For dashboard page - personal score display (less complex than team member)
export interface FragmentationDataPoint {
  date: string; // YYYY-MM-DD
  score: number;
  summary?: string; 
  riskLevel?: 'Low' | 'Moderate' | 'High'; 
}
