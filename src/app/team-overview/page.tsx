
"use client";

import { useEffect, useState } from "react";
import { TeamMemberCard } from "@/components/team-overview/team-member-card";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Users, BarChart3, ShieldAlert, Loader2, AlertTriangle, ShieldCheck } from "lucide-react"; // Added ShieldCheck
import Image from "next/image";
import { 
  calculateFragmentationScore, 
  type CalculateFragmentationScoreInput
} from "@/ai/flows/calculate-fragmentation-score";
import type { TeamMemberFocus, GenericActivityItem, MicrosoftGraphUser } from "@/lib/types";

// Generates a deterministic numeric offset based on userId
const getDeterministicActivityOffset = (userId: string, factor: number, range: number): number => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  // Use modulo to keep it somewhat varied but deterministic based on ID
  return (Math.abs(hash) % factor) * range; 
};


// Mock activities - now more deterministic based on userId
const getMockActivitiesForUser = (userId: string): GenericActivityItem[] => {
  const now = Date.now();
  // Generate slightly different but consistent timestamps for each user based on their ID
  const offset1 = getDeterministicActivityOffset(userId, 5, 2 * 3600000); // up to 10 hours ago for meetings
  const offset2 = getDeterministicActivityOffset(userId, 3, 1 * 3600000); // up to 3 hours ago for tasks
  const offset3 = getDeterministicActivityOffset(userId, 7, 0.5 * 3600000); // up to 3.5 hours ago for emails
  const offset4 = getDeterministicActivityOffset(userId, 4, 3 * 3600000); // up to 12 hours ago for commits

  return [
    { type: 'meeting', timestamp: new Date(now - offset1).toISOString(), details: `Sync for ${userId.substring(0,5)}`, source: 'teams' },
    { type: 'task_update', timestamp: new Date(now - offset2).toISOString(), details: `Updated JIRA-${Math.floor(getDeterministicActivityOffset(userId, 100, 1)) + 100}`, source: 'jira' },
    { type: 'email_sent', timestamp: new Date(now - offset3).toISOString(), details: 'Follow-up with client', source: 'm365' },
    { type: 'code_commit', timestamp: new Date(now - offset4).toISOString(), details: `Feature: ABC for ${userId.substring(0,5)}`, source: 'other' },
    { type: 'meeting', timestamp: new Date(now - getDeterministicActivityOffset(userId, 24, 3600000)).toISOString(), details: 'Daily Stand-up', source: 'teams' },
  ];
};


export default function TeamOverviewPage() {
  const { user } = useAuth();
  const isHR = user?.role === 'hr';
  const [teamData, setTeamData] = useState<TeamMemberFocus[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(isHR); 
  const [userFetchError, setUserFetchError] = useState<string | null>(null);
  const [isCalculatingScores, setIsCalculatingScores] = useState(false);


  useEffect(() => {
    if (isHR) {
      const fetchGraphUsers = async () => {
        setIsLoadingUsers(true);
        setUserFetchError(null);
        setTeamData([]); // Clear previous data
        try {
          const response = await fetch("/api/microsoft-graph/users");
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to fetch MS Graph users: ${response.statusText}`);
          }
          const msUsers: MicrosoftGraphUser[] = await response.json();
          
          const validMsUsers = msUsers.filter(msUser => {
            if (!msUser.id) {
              console.warn(
                `Microsoft Graph user data missing ID. User Principal Name: ${msUser.userPrincipalName || 'N/A'}. This user will be skipped.`
              );
              return false;
            }
            return true;
          });

          if (validMsUsers.length === 0 && msUsers.length > 0) {
            setUserFetchError("Fetched users from MS Graph, but none had a valid 'id' field. Check MS Graph API response structure.");
            setIsLoadingUsers(false);
            return;
          }
           if (validMsUsers.length === 0) {
            setUserFetchError("No users with valid IDs found in Microsoft Graph. Ensure users exist and the API is returning them correctly with an 'id' field.");
            setIsLoadingUsers(false);
            return;
          }


          const initialTeamData: TeamMemberFocus[] = validMsUsers.map(msUser => ({
            id: msUser.id, 
            name: msUser.displayName || msUser.userPrincipalName || "Unknown User",
            email: msUser.userPrincipalName || "N/A",
            role: (msUser.userPrincipalName?.toLowerCase().includes('hr')) ? 'hr' : 'developer', 
            fragmentationScore: 0, 
            lastWeekTrend: 0, 
            overloadStatus: 'Stable', 
            avatarUrl: `https://placehold.co/100x100.png?text=${(msUser.displayName || msUser.userPrincipalName)?.[0]?.toUpperCase() || 'U'}`,
            isLoadingScore: true, 
            scoreError: null,
          }));
          setTeamData(initialTeamData);
          setIsLoadingUsers(false);
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
          // Skip if score already calculated, or if it previously errored and we don't want to retry automatically
          if (!member.isLoadingScore) return member; 

          try {
            const activities = getMockActivitiesForUser(member.id);
            const input: CalculateFragmentationScoreInput = {
              userId: member.id,
              activityWindowDays: 7, // Consistent window for mock data
              activities: activities,
            };
            console.log(`Requesting score calculation for ${member.name} (ID: ${member.id}) with deterministic activities.`);
            const result = await calculateFragmentationScore(input);
            console.log(`Score calculated for ${member.name} (ID: ${member.id}):`, result);
            return {
              ...member,
              aiCalculatedScore: result.fragmentationScore,
              aiSummary: result.summary,
              aiRiskLevel: result.riskLevel,
              isLoadingScore: false,
              scoreError: null,
            };
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : `Failed to calculate score for ${member.name}.`;
            console.error(`Error calculating score for ${member.name} (ID: ${member.id}):`, errorMessage, err);
            return {
              ...member,
              isLoadingScore: false,
              scoreError: errorMessage,
              aiSummary: `Error: ${errorMessage}`,
              aiRiskLevel: "High" as "Low" | "Moderate" | "High",
              aiCalculatedScore: 0, // Set a default score on error
            };
          }
        });

        const settledTeamData = await Promise.all(updatedTeamDataPromises);
        setTeamData(settledTeamData);
        // Check if all scores are done (either loaded or errored)
        if (settledTeamData.every(m => !m.isLoadingScore)) {
            setIsCalculatingScores(false);
        }
      };

      calculateScoresForAllMembers();
    }
  }, [isHR, teamData, isCalculatingScores]); // Rerun if teamData changes (e.g. more users loaded, or a score is calculated)
  
  const teamStats = teamData.reduce((acc, member) => {
    if (member.isLoadingScore || !member.aiRiskLevel) return acc; // Skip if loading or no risk level

    // Prioritize aiRiskLevel if available (meaning AI calculation was successful)
    const riskLevel = member.aiRiskLevel || member.overloadStatus;
    
    const status = riskLevel === 'Low' ? 'Stable' : riskLevel === 'Moderate' ? 'At Risk' : 'Overloaded'; 
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
      {isHR && userFetchError && !isLoadingUsers && (
        <Alert variant="destructive" className="shadow-md">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Error Fetching Users</AlertTitle>
          <AlertDescription>{userFetchError} Please ensure Microsoft Graph API is configured correctly in .env and the service is running.</AlertDescription>
        </Alert>
      )}

      {isHR && !isLoadingUsers && !userFetchError && isCalculatingScores && teamData.some(m => m.isLoadingScore) && (
        <Alert variant="default" className="shadow-md border-blue-500/50 text-blue-700 dark:border-blue-400/50 dark:text-blue-400">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-500" />
          <AlertTitle className="font-semibold text-blue-700 dark:text-blue-400">Calculating Scores</AlertTitle>
          <AlertDescription className="text-blue-600 dark:text-blue-500">
            The AI is currently calculating fragmentation scores for team members. This may take a moment... ({teamData.filter(m=>m.isLoadingScore).length} remaining)
          </AlertDescription>
        </Alert>
      )}
      
      {isHR && !isLoadingUsers && !userFetchError && !isCalculatingScores && teamData.length > 0 && !teamData.some(m=>m.isLoadingScore) && (
         <Alert variant="default" className="shadow-md border-green-500/50 text-green-700 dark:border-green-400/50 dark:text-green-400">
          <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-500" />
          <AlertTitle className="font-semibold text-green-700 dark:text-green-400">Calculations Complete</AlertTitle>
          <AlertDescription className="text-green-600 dark:text-green-500">
            All fragmentation scores have been calculated.
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
          {isHR && !isLoadingUsers && !userFetchError && teamData.length === 0 && !isCalculatingScores && (
             <Alert className="col-span-full">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Users Found in Microsoft Graph</AlertTitle>
              <AlertDescription>
                No users were returned from the Microsoft Graph API. Check your configuration and ensure there are users in your tenant, or that the users have an 'id' field.
              </AlertDescription>
            </Alert>
          )}
          {teamData.map((member) => (
            <TeamMemberCard key={member.id} member={member} showDetailedScore={isHR} />
          ))}
           {!isHR && teamData.length === 0 && ( 
            <Alert className="col-span-full">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Team Data Available</AlertTitle>
              <AlertDescription>
                Team overview data is not available for your role or could not be loaded.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
