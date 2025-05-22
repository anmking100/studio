"use client";

import { FragmentationScoreCard } from "@/components/dashboard/fragmentation-score-card";
import { FocusTrendsChart } from "@/components/dashboard/focus-trends-chart";
import { AnomalyAlert } from "@/components/dashboard/anomaly-alert";
import { mockFragmentationScores, mockCurrentFragmentationScore } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Lightbulb, CheckSquare } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import Image from "next/image";
import { useEffect, useState } from "react";

export default function DashboardPage() {
  const { user } = useAuth();
  const [randomTip, setRandomTip] = useState("");

  useEffect(() => {
    const productivityTips = [
      "Try the Pomodoro Technique: 25 minutes of focused work followed by a 5-minute break.",
      "Batch similar tasks together to minimize context switching.",
      "Turn off notifications during focused work sessions.",
      "Schedule dedicated 'deep work' blocks in your calendar.",
      "Take short breaks every hour to rest your mind."
    ];
    setRandomTip(productivityTips[Math.floor(Math.random() * productivityTips.length)]);
  }, []);
  
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
          <FragmentationScoreCard currentScore={mockCurrentFragmentationScore} previousScore={previousScore} />
        </div>
        <div className="lg:col-span-2">
          <AnomalyAlert fragmentationScores={recentFragmentationScores} />
        </div>
      </div>

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
