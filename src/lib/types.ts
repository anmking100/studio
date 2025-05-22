
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
  score: number;
  riskLevel?: 'Low' | 'Moderate' | 'High';
  summary?: string;
}

export interface TeamMemberFocus {
  id: string; 
  name: string;
  email?: string; // Made optional as MSGraphUser might not always have it as UPN
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

export interface GenericActivityItem {
  type: string; 
  timestamp: string; 
  details?: string; 
  source: 'teams' | 'jira' | 'm365' | 'github' | 'other';
  durationMinutes?: number; // Added to store meeting duration
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
  activitiesCount?: number; // Optional: count of activities processed
}

// For dashboard page - personal score display (less complex than team member)
export interface FragmentationDataPoint {
  date: string; // YYYY-MM-DD
  score: number;
  summary?: string; 
  riskLevel?: 'Low' | 'Moderate' | 'High'; 
}
