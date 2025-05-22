
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, Users, ListChecks } from "lucide-react";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { JiraUser } from "@/lib/types";

const JiraIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" className="h-8 w-8 text-blue-600">
    <path d="M12.296 2.017L2.078 6.075a.302.302 0 00-.197.355l4.08 13.536a.301.301 0 00.353.198l10.22-4.057a.302.302 0 00.197-.355L12.647 2.215a.304.304 0 00-.35-.198zm-.39 1.408l8.315 3.3-3.29 10.92-8.313-3.3zm-1.02 8.13l-2.057-.816 1.24-4.122 2.056.816z"></path>
  </svg>
);


export default function JiraIntegrationPage() {
  const [jiraUsers, setJiraUsers] = useState<JiraUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJiraUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/jira/users");
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to fetch Jira users: ${response.statusText}`);
      }
      const data: JiraUser[] = await response.json();
      setJiraUsers(data);
    } catch (err: any) {
      console.error("Error fetching Jira users:", err);
      setError(err.message || "An unknown error occurred while fetching Jira users.");
    } finally {
      setIsLoading(false);
    }
  };

   useEffect(() => {
    // Fetch users when the component mounts
    fetchJiraUsers();
  }, []);

  return (
    <div className="space-y-6">
      <Card className="bg-card shadow-lg overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-500 p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
                <JiraIcon />
              <div>
                <CardTitle className="text-3xl font-bold text-primary-foreground">
                  Jira Users
                </CardTitle>
                <CardDescription className="text-lg text-primary-foreground/80 mt-1">
                  View users fetched from your Jira instance.
                </CardDescription>
              </div>
            </div>
             <Image
              src="https://placehold.co/300x150.png"
              alt="Jira integration illustration"
              width={150}
              height={75}
              className="rounded-lg mt-4 md:mt-0 opacity-80"
              data-ai-hint="jira logo team"
            />
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              <CardTitle>Jira User List</CardTitle>
            </div>
            <Button onClick={fetchJiraUsers} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ListChecks className="mr-2 h-4 w-4" />
              )}
              Refresh Jira Users
            </Button>
          </div>
          <CardDescription>
            Active users with email addresses retrieved from your Jira instance (up to 50 users shown).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2 text-muted-foreground">Loading Jira users...</p>
            </div>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error Fetching Jira Users</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!isLoading && !error && jiraUsers.length === 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Jira Users Found</AlertTitle>
              <AlertDescription>
                No active users with email addresses were returned from the Jira API.
                Ensure your Jira .env file is correctly configured with `JIRA_INSTANCE_URL`, `JIRA_USERNAME`, and `JIRA_API_TOKEN`.
                The Jira integration user also needs 'Browse users and groups' global permission.
                Also, check if the users you expect have an email address associated with them in Jira.
              </AlertDescription>
            </Alert>
          )}
          {!isLoading && !error && jiraUsers.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Avatar</TableHead>
                  <TableHead>Display Name</TableHead>
                  <TableHead>Email Address</TableHead>
                  <TableHead>Account ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jiraUsers.map((user) => (
                  <TableRow key={user.accountId}>
                    <TableCell>
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={user.avatarUrl || `https://placehold.co/48x48.png?text=${user.displayName?.[0]?.toUpperCase()}`} alt={user.displayName} data-ai-hint="user avatar" />
                        <AvatarFallback>{user.displayName?.[0]?.toUpperCase() || "?"}</AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">{user.displayName || "N/A"}</TableCell>
                    <TableCell>{user.emailAddress || "N/A"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{user.accountId}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
