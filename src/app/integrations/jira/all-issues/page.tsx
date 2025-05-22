
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, ListChecks, CalendarDays, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import { format, startOfDay, subDays, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import type { JiraIssue } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";

const JiraIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" className="h-8 w-8 text-blue-600">
    <path d="M12.296 2.017L2.078 6.075a.302.302 0 00-.197.355l4.08 13.536a.301.301 0 00.353.198l10.22-4.057a.302.302 0 00.197-.355L12.647 2.215a.304.304 0 00-.35-.198zm-.39 1.408l8.315 3.3-3.29 10.92-8.313-3.3zm-1.02 8.13l-2.057-.816 1.24-4.122 2.056.816z"></path>
  </svg>
);

export default function JiraAllRawIssuesPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date();
    return {
      from: startOfDay(subDays(today, 6)),
      to: endOfDay(today),
    };
  });
  const [rawIssues, setRawIssues] = useState<JiraIssue[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetchRawIssues = async () => {
    if (!dateRange?.from || !dateRange?.to) {
      setError("Please select a valid date range.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setRawIssues(null);

    try {
      const params = new URLSearchParams({
        startDate: dateRange.from.toISOString(),
        endDate: dateRange.to.toISOString(),
      });
      const response = await fetch(`/api/jira/all-raw-issues?${params.toString()}`);
      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || responseData.details || `Failed to fetch raw Jira issues: ${response.statusText}`);
      }
      setRawIssues(responseData as JiraIssue[]);
    } catch (err: any) {
      console.error("Error fetching raw Jira issues:", err);
      setError(err.message || "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card shadow-lg overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-500 p-6 md:p-8">
          <div className="flex items-center gap-3">
            <JiraIcon />
            <div>
              <CardTitle className="text-3xl font-bold text-primary-foreground">
                All Assigned Jira Issues Viewer
              </CardTitle>
              <CardDescription className="text-lg text-primary-foreground/80 mt-1">
                Inspect raw JSON data for all assigned issues within a date range from your Jira instance.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Query Parameters</CardTitle>
          <CardDescription>Specify a date range to fetch all assigned Jira issues.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label>Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn("w-full justify-start text-left font-normal mt-1", !dateRange?.from && "text-muted-foreground")}
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {dateRange?.from ? format(dateRange.from, "LLL dd, y") : <span>Pick a start date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single" selected={dateRange?.from} onSelect={(day) => setDateRange(prev => ({ ...prev, from: day || undefined }))}
                    disabled={(date) => date > (dateRange?.to || new Date()) || date > new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex-1">
              <Label>End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn("w-full justify-start text-left font-normal mt-1", !dateRange?.to && "text-muted-foreground")}
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {dateRange?.to ? format(dateRange.to, "LLL dd, y") : <span>Pick an end date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single" selected={dateRange?.to} onSelect={(day) => setDateRange(prev => ({ ...prev, to: day ? endOfDay(day) : undefined }))}
                    disabled={(date) => date < (dateRange?.from || new Date(0)) || date > new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleFetchRawIssues} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Fetch All Assigned Jira Issues
          </Button>
        </CardFooter>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2 text-muted-foreground">Fetching raw issues...</p>
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {rawIssues !== null && !isLoading && (
        <Card>
          <CardHeader>
            <CardTitle>Raw Jira Issues Data</CardTitle>
            <CardDescription>
              Found {rawIssues.length} assigned issue(s) matching your criteria. Displaying the raw JSON response.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rawIssues.length > 0 ? (
              <ScrollArea className="h-[500px] w-full rounded-md border p-4 bg-muted/30">
                <pre className="text-xs whitespace-pre-wrap break-all">
                  {JSON.stringify(rawIssues, null, 2)}
                </pre>
              </ScrollArea>
            ) : (
              <Alert>
                <ListChecks className="h-4 w-4" />
                <AlertTitle>No Assigned Issues Found</AlertTitle>
                <AlertDescription>
                  No assigned Jira issues were found matching the specified date range. Check your date range or the Jira API logs.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
