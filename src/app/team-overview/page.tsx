
"use client";

import { useEffect, useState } from "react";
import { TeamMemberCard } from "@/components/team-overview/team-member-card";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Users, BarChart3, ShieldAlert, Loader2, AlertTriangle } from "lucide-react";
import Image from "next/image";
import { 
  calculateFragmentationScore, 
  type CalculateFragmentationScoreInput
} from "@/ai/flows/calculate-fragmentation-score";
import type { TeamMemberFocus, GenericActivityItem, MicrosoftGraphUser } from "@/lib/types";

// Mock activities - in a real app, this would be fetched from backend integrations per user
const getMockActivitiesForUser = (userId: string): GenericActivityItem[] => [
  { type: 'meeting', timestamp: new Date(Date.now() - Math.random() * 5 * 24 * 3600000).toISOString(), details: `Sync for ${userId}`, source: 'teams' },
  { type: 'task_update', timestamp: new Date(Date.now() - Math.random() * 3 * 24 * 3600000).toISOString(), details: `Updated JIRA-${Math.floor(Math.random()*100)}`, source: 'jira' },
  { type: 'email_sent', timestamp: new Date(Date.now() - Math.random() * 2 * 24 * 3600000).toISOString(), details: 'Follow-up with client', source: 'm365' },
  { type: 'code_commit', timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 3600000).toISOString(), details: `Feature: ABC for ${userId}`, source: 'other' },
];


export default function TeamOverviewPage() {
  const { user } = useAuth();
  const isHR = user?.role === 'hr';
  const [teamData, setTeamData] = useState<TeamMemberFocus[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(isHR); // True if HR, to trigger user fetching
  const [userFetchError, setUserFetchError] = useState<string | null>(null);
  const [isCalculatingScores, setIsCalculatingScores] = useState(false);


  useEffect(() => {
    if (isHR) {
      const fetchGraphUsers = async () => {
        setIsLoadingUsers(true);
        setUserFetchError(null);
        try {
          const response = await fetch("/api/microsoft-graph/users");
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to fetch MS Graph users: ${response.statusText}`);
          }
          const msUsers: MicrosoftGraphUser[] = await response.json();
          
          const initialTeamData: TeamMemberFocus[] = msUsers.map(msUser => ({
            id: msUser.id,
            name: msUser.displayName || msUser.userPrincipalName,
            email: msUser.userPrincipalName,
            role: 'developer', // Default role for MS Graph users in this context
            fragmentationScore: 0, // Placeholder, will be calculated
            lastWeekTrend: 0, // Placeholder
            overloadStatus: 'Stable', // Placeholder
            avatarUrl: `https://placehold.co/100x100.png?text=${(msUser.displayName || msUser.userPrincipalName)?.[0]?.toUpperCase() || 'U'}`, // Basic avatar
            isLoadingScore: true,
            scoreError: null,
          }));
          setTeamData(initialTeamData);
          setIsLoadingUsers(false);
          // Trigger score calculation after users are fetched
          if (initialTeamData.length > 0) {
            setIsCalculatingScores(true); 
          }
        } catch (err: any) {
          console.error("Error fetching MS Graph users:", err);
          setUserFetchError(err.message || "An unknown error occurred while fetching users.");
          setIsLoadingUsers(false);
        }
      };
      fetchGraphUsers();
    }
  }, [isHR]);

  useEffect(() => {
    if (isHR && isCalculatingScores && teamData.length > 0 && teamData.some(m => m.isLoadingScore)) {
      const calculateScoresForAllMembers = async () => {
        const updatedTeamDataPromises = teamData.map(async (member) => {
          // If score is already calculated or there was an error, skip
          if (!member.isLoadingScore || member.scoreError) return member;

          try {
            const activities = getMockActivitiesForUser(member.id);
            const input: CalculateFragmentationScoreInput = {
              userId: member.id,
              activityWindowDays: 7,
              activities: activities,
            };
            const result = await calculateFragmentationScore(input);
            return {
              ...member,
              aiCalculatedScore: result.fragmentationScore,
              aiSummary: result.summary,
              aiRiskLevel: result.riskLevel,
              isLoadingScore: false,
              scoreError: null,
            };
          } catch (err) {
            console.error(`Error calculating score for ${member.name}:`, err);
            return {
              ...member,
              isLoadingScore: false,
              scoreError: "Failed to calculate score.",
            };
          }
        });

        const settledTeamData = await Promise.all(updatedTeamDataPromises);
        setTeamData(settledTeamData);
        // Check if all scores are done
        if (settledTeamData.every(m => !m.isLoadingScore)) {
            setIsCalculatingScores(false);
        }
      };

      calculateScoresForAllMembers();
    }
  }, [isHR, teamData, isCalculatingScores]);
  
  const teamStats = teamData.reduce((acc, member) => {
    if (member.isLoadingScore || member.scoreError) return acc; // Don't count loading/error states in stats

    const status = member.aiRiskLevel ? 
                   (member.aiRiskLevel === 'Low' ? 'Stable' : member.aiRiskLevel === 'Moderate' ? 'At Risk' : 'Overloaded') 
                   : 'Stable'; // Default if no AI risk level
    if (status === "Stable") acc.stable++;
    else if (status === "At Risk") acc.atRisk++;
    else if (status === "Overloaded") acc.overloaded++;
    return acc;
  }, { stable: 0, atRisk: 0, overloaded: 0 });


  return (
    <div className="space-y-6">
       <Card className="bg-card shadow-lg overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-primary via-indigo-600 to-accent p-6 md:p-8">
           <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-3xl font-bold text-primary-foreground">Team Focus Overview</CardTitle>
              <CardDescription className="text-lg text-primary-foreground/80 mt-1">
                Visualize your team's cognitive load and stability.
              </CardDescription>
            </div>
             <Image 
              src="https://placehold.co/300x150.png" 
              alt="Team collaboration illustration" 
              width={150} 
              height={75} 
              className="rounded-lg mt-4 md:mt-0 opacity-80"
              data-ai-hint="team collaboration"
            />
          </div>
        </CardHeader>
      </Card>
      
      {!isHR && (
        <Alert variant="default" className="border-accent bg-accent/10 text-accent-foreground shadow-md">
          <ShieldAlert className="h-5 w-5 text-accent" />
          <AlertTitle className="font-semibold text-accent">Privacy Notice</AlertTitle>
          <AlertDescription>
            To protect individual privacy, detailed fragmentation scores are only visible to HR personnel. You are seeing an anonymized overview based on general roles.
          </AlertDescription>
        </Alert>
      )}

      {isHR && isLoadingUsers && (
         <Alert variant="default" className="shadow-md border-blue-500/50 text-blue-700 dark:border-blue-400/50 dark:text-blue-400">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-500" />
          <AlertTitle className="font-semibold text-blue-700 dark:text-blue-400">Fetching Team Members</AlertTitle>
          <AlertDescription className="text-blue-600 dark:text-blue-500">
            Loading user data from Microsoft Graph...
          </AlertDescription>
        </Alert>
      )}
      {isHR && userFetchError && (
        <Alert variant="destructive" className="shadow-md">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Error Fetching Users</AlertTitle>
          <AlertDescription>{userFetchError} Please ensure Microsoft Graph API is configured correctly in .env and the service is running.</AlertDescription>
        </Alert>
      )}

      {isHR && !isLoadingUsers && !userFetchError && isCalculatingScores && (
        <Alert variant="default" className="shadow-md border-blue-500/50 text-blue-700 dark:border-blue-400/50 dark:text-blue-400">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-500" />
          <AlertTitle className="font-semibold text-blue-700 dark:text-blue-400">Calculating Scores</AlertTitle>
          <AlertDescription className="text-blue-600 dark:text-blue-500">
            The AI is currently calculating fragmentation scores for team members. This may take a moment...
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stable Members</CardTitle>
            <Users className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{teamStats.stable}</div>
            <p className="text-xs text-muted-foreground">Currently focused and balanced</p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">At Risk Members</CardTitle>
            <Users className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{teamStats.atRisk}</div>
            <p className="text-xs text-muted-foreground">Showing signs of increased fragmentation</p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overloaded Members</CardTitle>
            <Users className="h-5 w-5 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{teamStats.overloaded}</div>
            <p className="text-xs text-muted-foreground">High fragmentation, may need support</p>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold">Team Member Status</CardTitle>
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <CardDescription>
            {isHR ? "Detailed view of each team member's AI-calculated focus status from Microsoft Graph." : "Overview of team member stability."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {isHR && !isLoadingUsers && !userFetchError && teamData.length === 0 && (
             <Alert className="col-span-full">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Users Found in Microsoft Graph</AlertTitle>
              <AlertDescription>
                No users were returned from the Microsoft Graph API. Check your configuration and ensure there are users in your tenant.
              </AlertDescription>
            </Alert>
          )}
          {teamData.map((member) => (
            <TeamMemberCard key={member.id} member={member} showDetailedScore={isHR} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

    