
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, Users, ListChecks } from "lucide-react";
import type { MicrosoftGraphUser } from "@/lib/types";
import Image from "next/image";

export default function MicrosoftGraphUsersPage() {
  const [users, setUsers] = useState<MicrosoftGraphUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/microsoft-graph/users");
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to fetch users: ${response.statusText}`);
      }
      const data: MicrosoftGraphUser[] = await response.json();
      setUsers(data);
    } catch (err: any) {
      console.error("Error fetching MS Graph users:", err);
      setError(err.message || "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // You might want to trigger this on a button click instead of page load
    // if the API call is expensive or not always needed.
    fetchUsers();
  }, []);

  return (
    <div className="space-y-6">
      <Card className="bg-card shadow-lg overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-primary via-indigo-600 to-accent p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-3xl font-bold text-primary-foreground">
                Microsoft Graph Users
              </CardTitle>
              <CardDescription className="text-lg text-primary-foreground/80 mt-1">
                View users fetched from Microsoft Graph API.
              </CardDescription>
            </div>
            <Image
              src="https://placehold.co/300x150.png" 
              alt="Microsoft Graph integration" 
              width={150} 
              height={75} 
              className="rounded-lg mt-4 md:mt-0 opacity-80"
              data-ai-hint="microsoft graph integration"
            />
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              <CardTitle>User List</CardTitle>
            </div>
            <Button onClick={fetchUsers} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ListChecks className="mr-2 h-4 w-4" />
              )}
              Refresh Users
            </Button>
          </div>
          <CardDescription>
            Users retrieved from your Microsoft Entra ID tenant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2 text-muted-foreground">Loading users...</p>
            </div>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error Fetching Users</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!isLoading && !error && users.length === 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Users Found</AlertTitle>
              <AlertDescription>
                No users were returned from the Microsoft Graph API, or the initial fetch hasn't completed. Ensure your .env file is correctly configured with MS_TENANT_ID, MS_CLIENT_ID, and MS_CLIENT_SECRET.
              </AlertDescription>
            </Alert>
          )}
          {!isLoading && !error && users.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Display Name</TableHead>
                  <TableHead>User Principal Name</TableHead>
                  <TableHead>Assigned Licenses (Count)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id || user.userPrincipalName}>
                    <TableCell className="font-medium">{user.displayName || "N/A"}</TableCell>
                    <TableCell>{user.userPrincipalName}</TableCell>
                    <TableCell>{user.assignedLicenses?.length || 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
       <Alert variant="default" className="border-blue-500/50 text-blue-700 dark:border-blue-400/50 dark:text-blue-400 shadow-sm">
          <ListChecks className="h-5 w-5 text-blue-600 dark:text-blue-500" />
          <AlertTitle className="font-semibold text-blue-700 dark:text-blue-400">Configuration Note</AlertTitle>
          <AlertDescription className="text-blue-600 dark:text-blue-500">
            Please ensure you have filled in your `MS_TENANT_ID`, `MS_CLIENT_ID`, and `MS_CLIENT_SECRET` in the `.env` file at the root of the project.
            The application needs to be restarted after changing `.env` variables.
            The Microsoft Entra (Azure AD) App Registration also needs to have the `User.Read.All` Application permission granted for Microsoft Graph and admin consent provided.
          </AlertDescription>
        </Alert>
    </div>
  );
}
