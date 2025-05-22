
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'developer' | 'hr';
  avatarUrl?: string;
}

export interface FragmentationDataPoint {
  date: string; // YYYY-MM-DD
  score: number;
}

export interface TeamMemberFocus extends User {
  fragmentationScore: number;
  lastWeekTrend: number; // e.g. -0.5, +1.2
  overloadStatus: 'Stable' | 'At Risk' | 'Overloaded';
}

export interface Task {
  id: string;
  description: string;
  // Source could be added if needed for more context in task batching
  // source?: 'Jira' | 'Git' | 'Calendar' | 'Slack' | 'Teams' | 'Other';
}

export interface MicrosoftGraphLicense {
  skuId: string;
  disabledPlans: string[];
}
export interface MicrosoftGraphUser {
  id: string;
  displayName: string | null;
  userPrincipalName: string;
  assignedLicenses: MicrosoftGraphLicense[];
}
