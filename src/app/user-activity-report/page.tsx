
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, UserSearch, CalendarDays, BarChartHorizontalBig, Clock, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import { format, startOfDay, subDays, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import type { UserActivityMetrics } from "@/lib/types";

export default function UserActivityReportPage() {
  const [userId, setUserId] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date();
    return {
      from: startOfDay(subDays(today, 6)), // Default to last 7 days
      to: endOfDay(today),
    };
  });
  const [metrics, setMetrics] = useState<UserActivityMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateReport = async () => {
    if (!userId.trim()) {
      setError("Please enter a Microsoft Graph User ID.");
      return;
    }
    if (!dateRange?.from || !dateRange?.to) {
      setError("Please select a valid date range.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setMetrics(null);

    try {
      const params = new URLSearchParams({
        userId: userId.trim(),
        startDate: dateRange.from.toISOString(),
        endDate: dateRange.to.toISOString(),
      });
      const response = await fetch(`/api/user-activity-metrics?${params.toString()}`);
      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || responseData.details || `Failed to fetch activity metrics: ${response.statusText}`);
      }
      setMetrics(responseData as UserActivityMetrics);
    } catch (err: any) {
      console.error("Error fetching user activity metrics:", err);
      setError(err.message || "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const totalMeetingHours = metrics?.totalMeetingMinutes ? (metrics.totalMeetingMinutes / 60).toFixed(1) : "0.0";

  return (
    <div className="space-y-6">
      <Card className="bg-card shadow-lg overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-accent to-primary p-6 md:p-8">
          <div className="flex items-center gap-3">
            <BarChartHorizontalBig className="h-8 w-8 text-primary-foreground" />
            <div>
              <CardTitle className="text-3xl font-bold text-primary-foreground">
                User Activity Report
              </CardTitle>
              <CardDescription className="text-lg text-primary-foreground/80 mt-1">
                Generate activity summaries for a specific user and time frame.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Report Parameters</CardTitle>
          <CardDescription>Enter User ID and select a date range to generate the report.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="user-id">Microsoft Graph User ID</Label>
            <Input
              id="user-id"
              type="text"
              placeholder="Enter MS Graph User ID (e.g., a GUID)"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="mt-1"
            />
             <p className="text-xs text-muted-foreground mt-1">
              Hint: You can find User IDs on the "MS Graph Users" integration page.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="start-date-popover">Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="start-date-popover"
                    variant={"outline"}
                    className={cn("w-full justify-start text-left font-normal mt-1", !dateRange?.from && "text-muted-foreground")}
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {dateRange?.from ? format(dateRange.from, "LLL dd, yyyy") : <span>Pick a start date</span>}
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
              <Label htmlFor="end-date-popover">End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="end-date-popover"
                    variant={"outline"}
                    className={cn("w-full justify-start text-left font-normal mt-1", !dateRange?.to && "text-muted-foreground")}
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {dateRange?.to ? format(dateRange.to, "LLL dd, yyyy") : <span>Pick an end date</span>}
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
          <Button onClick={handleGenerateReport} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserSearch className="mr-2 h-4 w-4" />
            )}
            Generate Report
          </Button>
        </CardFooter>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2 text-muted-foreground">Generating report...</p>
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {metrics && !isLoading && (
        <Card>
          <CardHeader>
            <CardTitle>Activity Summary for {metrics.userId}</CardTitle>
            <CardDescription>
              Report for the period: {dateRange?.from ? format(dateRange.from, "PP") : ""} - {dateRange?.to ? format(dateRange.to, "PP") : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 border rounded-md bg-secondary/30">
                <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    <span className="font-medium">Total Meeting Time:</span>
                </div>
                <span className="font-semibold text-lg">{totalMeetingHours} hours ({metrics.meetingCount} meetings)</span>
            </div>
             <div className="flex items-center justify-between p-3 border rounded-md bg-secondary/30">
                <div className="flex items-center gap-2">
                    <Info className="h-5 w-5 text-blue-500" />
                    <span className="font-medium">Average Message Response Time:</span>
                </div>
                <span className="font-semibold text-lg text-muted-foreground">
                    {metrics.averageResponseTimeMinutes !== null ? `${metrics.averageResponseTimeMinutes.toFixed(1)} minutes` : "(Feature Coming Soon)"}
                </span>
            </div>
            {metrics.error && (
                 <Alert variant="destructive" className="mt-2">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Partial Data Warning</AlertTitle>
                    <AlertDescription>{metrics.error}</AlertDescription>
                </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
