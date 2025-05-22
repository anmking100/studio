
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Briefcase, Cog } from "lucide-react";
import Image from "next/image";

export default function TeamsIntegrationPage() {
  return (
    <div className="space-y-6">
      <Card className="bg-card shadow-lg overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 p-6 md:p-8">
           <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-3xl font-bold text-primary-foreground">
                Microsoft Teams Integration
              </CardTitle>
              <CardDescription className="text-lg text-primary-foreground/80 mt-1">
                Connect FocusFlow with Microsoft Teams. (Coming Soon)
              </CardDescription>
            </div>
            <Image 
              src="https://placehold.co/300x150.png" 
              alt="Teams integration" 
              width={150} 
              height={75} 
              className="rounded-lg mt-4 md:mt-0 opacity-80"
              data-ai-hint="teams logo"
            />
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cog className="h-6 w-6 text-primary" />
            <CardTitle>Configuration</CardTitle>
          </div>
          <CardDescription>
            Settings for Microsoft Teams integration will appear here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="default" className="border-blue-500/50 text-blue-700 dark:border-blue-400/50 dark:text-blue-400 shadow-sm">
            <Briefcase className="h-5 w-5 text-blue-600 dark:text-blue-500" />
            <AlertTitle className="font-semibold text-blue-700 dark:text-blue-400">Feature Under Development</AlertTitle>
            <AlertDescription className="text-blue-600 dark:text-blue-500">
              Full integration with Microsoft Teams to fetch activity data for fragmentation score calculation is coming soon.
              This section will allow you to configure the connection to your Teams environment.
              Ensure your `TEAMS_CLIENT_ID`, `TEAMS_CLIENT_SECRET`, and `TEAMS_TENANT_ID` are set in the `.env` file for future use.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
