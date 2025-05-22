
"use client";

import { FragmentationScoreCard } from "@/components/dashboard/fragmentation-score-card";
import { FocusTrendsChart } from "@/components/dashboard/focus-trends-chart";
import { AnomalyAlert } from "@/components/dashboard/anomaly-alert";
import { mockFragmentationScores } from "@/lib/mock-data"; // Keep for trends chart and previous score
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Lightbulb, CheckSquare, Loader2, AlertTriangle, Info } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import Image from "next/image";
import { useEffect, useState } from "react";
import { 
  calculateFragmentationScore, 
  type CalculateFragmentationScoreInput,
  type CalculateFragmentationScoreOutput 
} from "@/ai/flows/calculate-fragmentation-score";
import type { GenericActivityItem } from "@/lib/types";

export default function DashboardPage() {
  const { user } = useAuth();
  const [randomTip, setRandomTip] = useState("");
  const [currentFragmentationData, setCurrentFragmentationData] = useState<CalculateFragmentationScoreOutput | null>(null);
  const [isLoadingScore, setIsLoadingScore] = useState(true);
  const [scoreError, setScoreError] = useState<string | null>(null);

  useEffect(() => {
    const productivityTips = [
      "Try the Pomodoro Technique: 25 minutes of focused work followed by a 5-minute break.",
      "Batch similar tasks together to minimize context switching.",
      "Turn off notifications during focused work sessions.",
      "Schedule dedicated 'deep work' blocks in your calendar.",
      "Take short breaks every hour to rest your mind."
    ];
    setRandomTip(productivityTips[Math.floor(Math.random() * productivityTips.length)]);

    const fetchScore = async () => {
      if (!user) return;

      setIsLoadingScore(true);
      setScoreError(null);

      // Mock activities - in a real app, this would be fetched from backend integrations
      const mockActivities: GenericActivityItem[] = [
        { type: 'meeting', timestamp: new Date(Date.now() - 2 * 3600000).toISOString(), details: 'Project Alpha Sync', source: 'teams' },
        { type: 'task_update', timestamp: new Date(Date.now() - 1 * 3600000).toISOString(), details: 'Updated JIRA-123 to In Progress', source: 'jira' },
        { type: 'email_sent', timestamp: new Date(Date.now() - 0.5 * 3600000).toISOString(), details: 'Follow-up with client on proposal', source: 'm365' },
        { type: 'code_commit', timestamp: new Date(Date.now() - 3 * 3600000).toISOString(), details: 'Feature: User profile page', source: 'other' }, // Assuming 'other' for GitHub etc.
        { type: 'meeting', timestamp: new Date(Date.now() - 24 * 3600000).toISOString(), details: 'Daily Stand-up', source: 'teams' },
      ];

      const input: CalculateFragmentationScoreInput = {
        userId: user.id,
        activityWindowDays: 1, // Looking at today's mock activities
        activities: mockActivities,
      };

      try {
        const result = await calculateFragmentationScore(input);
        setCurrentFragmentationData(result);
      } catch (err) {
        console.error("Error calculating fragmentation score:", err);
        setScoreError("Failed to calculate your fragmentation score. Please try again later.");
      } finally {
        setIsLoadingScore(false);
      }
    };

    fetchScore();
  }, [user]);
  
  // Use last 14 days of data for the chart
  const recentFragmentationScores = mockFragmentationScores.slice(-14);
  const previousScore = recentFragmentationScores.length > 1 ? recentFragmentationScores.slice(-2)[0].score : undefined;

  return (
    <div className="space-y-6">
      <Card className="bg-card shadow-lg overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-primary to-accent p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-3xl font-bold text-primary-foreground">
                Welcome back, {user?.name?.split(" ")[0] || "User"}!
              </CardTitle>
              <CardDescription className="text-lg text-primary-foreground/80 mt-1">
                Here's your personalized focus overview.
              </CardDescription>
            </div>
            <Image 
              src="https://placehold.co/300x150.png" 
              alt="Abstract focus illustration" 
              width={150} 
              height={75} 
              className="rounded-lg mt-4 md:mt-0 opacity-80"
              data-ai-hint="abstract focus"
            />
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          {isLoadingScore && (
            <Card className="shadow-lg flex items-center justify-center min-h-[200px]">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2 text-muted-foreground">Calculating score...</p>
            </Card>
          )}
          {scoreError && !isLoadingScore && (
            <Alert variant="destructive" className="shadow-lg min-h-[200px]">
              <AlertTriangle className="h-5 w-5" />
              <AlertTitle>Score Error</AlertTitle>
              <AlertDescription>{scoreError}</AlertDescription>
            </Alert>
          )}
          {!isLoadingScore && !scoreError && currentFragmentationData && (
            <FragmentationScoreCard 
              currentScore={currentFragmentationData.fragmentationScore} 
              previousScore={previousScore}
              riskLevel={currentFragmentationData.riskLevel}
              summary={currentFragmentationData.summary}
            />
          )}
           {!isLoadingScore && !scoreError && !currentFragmentationData && (
             <Card className="shadow-lg flex flex-col items-center justify-center min-h-[200px] text-center p-4">
                <Info className="h-8 w-8 text-muted-foreground mb-2" />
                <CardTitle className="text-lg">Fragmentation Score</CardTitle>
                <CardDescription className="text-sm text-muted-foreground">Could not load fragmentation score data.</CardDescription>
            </Card>
           )}
        </div>
        <div className="lg:col-span-2">
          <AnomalyAlert fragmentationScores={recentFragmentationScores} />
        </div>
      </div>
      
      {currentFragmentationData && !isLoadingScore && !scoreError && (
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">AI Focus Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <AlertDescription className="text-muted-foreground whitespace-pre-wrap">{currentFragmentationData.summary}</AlertDescription>
             <p className="mt-2 text-sm font-medium">Risk Level: 
              <span className={`font-bold ${
                currentFragmentationData.riskLevel === 'High' ? 'text-destructive' :
                currentFragmentationData.riskLevel === 'Moderate' ? 'text-yellow-600' : 'text-green-600'
              }`}> {currentFragmentationData.riskLevel}
              </span>
            </p>
          </CardContent>
        </Card>
      )}


      <FocusTrendsChart data={recentFragmentationScores} />
      
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-semibold">Productivity Tip</CardTitle>
              <Lightbulb className="h-6 w-6 text-yellow-500" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{randomTip}</p>
          </CardContent>
        </Card>
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
          <CardHeader>
             <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-semibold">Quick Actions</CardTitle>
              <CheckSquare className="h-6 w-6 text-green-500" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-muted-foreground">What would you like to do?</p>
            <ul className="list-disc list-inside text-primary space-y-1">
                <li><a href="/task-batching" className="hover:underline">Suggest task batching</a></li>
                <li><a href="#" className="hover:underline opacity-50 cursor-not-allowed">Log focused work session (soon)</a></li>
                <li><a href="#" className="hover:underline opacity-50 cursor-not-allowed">Review daily goals (soon)</a></li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
