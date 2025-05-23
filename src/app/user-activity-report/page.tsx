
"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, UserSearch, CalendarDays, BarChartHorizontalBig, Clock, CheckCircle, ListChecksIcon, ChevronDown, FileQuestion, Hourglass, MessageSquareText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { DateRange } from "react-day-picker";
import { format, startOfDay, subDays, endOfDay, parseISO, eachDayOfInterval, isBefore } from "date-fns";
import { cn } from "@/lib/utils";
import type { UserActivityMetrics, MicrosoftGraphUser, JiraTaskDetail, GenericActivityItem } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";

const LIVE_DATA_START_DATE = startOfDay(new Date('2025-05-22T00:00:00.000Z'));

// Helper to generate consistent mock activities for a given user and day (copied from team-overview)
function getConsistentMockActivitiesForDay(userId: string, day: Date): GenericActivityItem[] {
  const activities: GenericActivityItem[] = [];
  const dayOfMonth = day.getUTCDate();
  const userIdInt = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

  if ((dayOfMonth + userIdInt) % 4 === 1) {
    activities.push({
      type: 'teams_meeting',
      timestamp: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 10 + (userIdInt % 3), 0, 0)).toISOString(),
      details: `Mock Sync Meeting for user ID slice ${userId.substring(0,5)} on day ${dayOfMonth}`,
      source: 'm365',
      durationMinutes: 30 + ((userIdInt % 3) * 10),
    });
  }
  if ((dayOfMonth + userIdInt + 2) % 5 === 0) {
     activities.push({
      type: 'teams_meeting',
      timestamp: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 14 + (userIdInt % 2), 30, 0)).toISOString(),
      details: `Afternoon Mock Huddle for user ID slice ${userId.substring(0,5)}`,
      source: 'm365',
      durationMinutes: 20 + ((userIdInt % 2) * 5),
    });
  }

  const numJiraTasks = (dayOfMonth % 3) + (userIdInt % 2) + 1;
  for (let i = 0; i < numJiraTasks; i++) {
    const isDone = (dayOfMonth + i + userIdInt) % 3 === 0;
    const taskType = (i + userIdInt) % 2 === 0 ? 'jira_issue_task' : 'jira_issue_bug';
    activities.push({
      type: taskType,
      timestamp: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 9 + i + (userIdInt % 4), 15 * i, 0)).toISOString(),
      details: `Mock Jira ${taskType.split('_').pop()} ${i+1} for user ID slice ${userId.substring(0,5)} on day ${dayOfMonth}`,
      source: 'jira',
      jiraStatusCategoryKey: isDone ? 'done' : ((dayOfMonth + i) % 2 === 0 ? 'indeterminate' : 'new'),
    });
  }
  return activities.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function calculateMetricsFromMockActivities(activities: GenericActivityItem[]): UserActivityMetrics {
  let totalMeetingMinutes = 0;
  const jiraTaskDetails: JiraTaskDetail[] = [];

  activities.forEach(activity => {
    if (activity.type === 'teams_meeting' && activity.durationMinutes) {
      totalMeetingMinutes += activity.durationMinutes;
    }
    if (activity.source === 'jira' && activity.type.startsWith('jira_issue_')) {
      jiraTaskDetails.push({
        key: `MOCK-${Math.random().toString(36).substring(2, 7)}`, // Mock key
        summary: activity.details || "Mock Jira Task",
        status: activity.jiraStatusCategoryKey === 'done' ? 'Done' : activity.jiraStatusCategoryKey === 'indeterminate' ? 'In Progress' : 'To Do',
        type: activity.type.replace('jira_issue_', ''),
        statusCategoryKey: activity.jiraStatusCategoryKey,
      });
    }
  });

  return {
    userId: "mockUser", // Placeholder as this is aggregated mock data
    totalMeetingMinutes,
    averageResponseTimeMinutes: null, // Still placeholder
    meetingCount: activities.filter(a => a.type === 'teams_meeting').length,
    jiraTasksWorkedOnCount: jiraTaskDetails.length,
    jiraTaskDetails: jiraTaskDetails,
  };
}


export default function UserActivityReportPage() {
  const [allMsGraphUsers, setAllMsGraphUsers] = useState<MicrosoftGraphUser[]>([]);
  const [isLoadingMsUsers, setIsLoadingMsUsers] = useState(true);
  const [msUsersError, setMsUsersError] = useState<string | null>(null);

  const [selectedUser, setSelectedUser] = useState<MicrosoftGraphUser | null>(null);
  const [isUserSelectOpen, setIsUserSelectOpen] = useState(false);

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date();
    return {
      from: startOfDay(subDays(today, 6)), 
      to: endOfDay(today),
    };
  });
  const [metrics, setMetrics] = useState<UserActivityMetrics | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [dataSourceMsg, setDataSourceMsg] = useState<string | null>(null);

  useEffect(() => {
    const fetchMsGraphUsers = async () => {
      setIsLoadingMsUsers(true);
      setMsUsersError(null);
      try {
        const response = await fetch("/api/microsoft-graph/users");
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Failed to fetch Microsoft Graph users: ${response.statusText}`);
        }
        const data: MicrosoftGraphUser[] = await response.json();
        setAllMsGraphUsers(data.filter(u => u.id && u.displayName)); 
      } catch (err: any) {
        console.error("Error fetching MS Graph users:", err);
        setMsUsersError(err.message || "An unknown error occurred while fetching users.");
      } finally {
        setIsLoadingMsUsers(false);
      }
    };
    fetchMsGraphUsers();
  }, []);


  const handleGenerateReport = async () => {
    if (!selectedUser) {
      setMetricsError("Please select a user.");
      return;
    }
    if (!selectedUser.id) {
      setMetricsError("Selected user is missing an ID. Cannot generate report.");
      return;
    }
    if (!dateRange?.from || !dateRange?.to) {
      setMetricsError("Please select a valid date range.");
      return;
    }

    setIsLoadingMetrics(true);
    setMetricsError(null);
    setMetrics(null);
    setDataSourceMsg(null);

    const useMockData = isBefore(dateRange.to, LIVE_DATA_START_DATE);

    if (useMockData) {
      setDataSourceMsg("Metrics based on consistent mock activity patterns for this historical period.");
      console.log(`USER ACTIVITY REPORT: Using MOCK data for range ${format(dateRange.from, "yyyy-MM-dd")} to ${format(dateRange.to, "yyyy-MM-dd")} for user ${selectedUser.displayName}`);
      let aggregatedMockActivities: GenericActivityItem[] = [];
      const daysInSelectedRange = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });

      daysInSelectedRange.forEach(day => {
        const mockActivitiesForDay = getConsistentMockActivitiesForDay(selectedUser.id!, day);
        aggregatedMockActivities.push(...mockActivitiesForDay);
      });
      
      const mockMetrics = calculateMetricsFromMockActivities(aggregatedMockActivities);
      mockMetrics.userId = selectedUser.id; // Set the correct userId
      setMetrics(mockMetrics);
      setIsLoadingMetrics(false);

    } else {
      setDataSourceMsg("Metrics based on live data from integrated APIs for this period.");
      console.log(`USER ACTIVITY REPORT: Using LIVE data for range ${format(dateRange.from, "yyyy-MM-dd")} to ${format(dateRange.to, "yyyy-MM-dd")} for user ${selectedUser.displayName}`);
      try {
        const params = new URLSearchParams({
          userId: selectedUser.id,
          startDate: dateRange.from.toISOString(),
          endDate: dateRange.to.toISOString(),
        });
        
        if (selectedUser.userPrincipalName) {
          params.append('userEmail', selectedUser.userPrincipalName);
        } else {
          console.warn(`User ${selectedUser.displayName} (ID: ${selectedUser.id}) is missing userPrincipalName. Jira tasks might not be fetched or might be inaccurate.`);
        }

        const response = await fetch(`/api/user-activity-metrics?${params.toString()}`);
        const responseData = await response.json();

        if (!response.ok) {
          throw new Error(responseData.error || responseData.details || `Failed to fetch activity metrics: ${response.statusText}`);
        }
        setMetrics(responseData as UserActivityMetrics);
      } catch (err: any) {
        console.error("Error fetching user activity metrics:", err);
        setMetricsError(err.message || "An unknown error occurred while fetching metrics.");
      } finally {
        setIsLoadingMetrics(false);
      }
    }
  };

  const totalMeetingHours = metrics?.totalMeetingMinutes ? (metrics.totalMeetingMinutes / 60).toFixed(1) : "0.0";
  const participatedDurationMinutes = metrics?.totalMeetingMinutes ? metrics.totalMeetingMinutes * 0.7 : 0; // This is still 70%
  const participatedDurationHours = (participatedDurationMinutes / 60).toFixed(1);

  const jiraTaskStatusCounts = useMemo(() => {
    if (!metrics?.jiraTaskDetails) {
      return { completed: 0, ongoing: 0, pending: 0, total: 0 };
    }
    const counts = metrics.jiraTaskDetails.reduce(
      (acc, task) => {
        const statusKey = typeof task.statusCategoryKey === 'string' ? task.statusCategoryKey.toLowerCase() : '';
        if (statusKey === 'done') {
          acc.completed++;
        } else if (statusKey === 'indeterminate') {
          acc.ongoing++;
        } else if (statusKey === 'new') {
          acc.pending++;
        } else if (statusKey !== '') { 
           acc.ongoing++;
        }
        return acc;
      },
      { completed: 0, ongoing: 0, pending: 0 }
    );
    return { ...counts, total: metrics.jiraTaskDetails.length };
  }, [metrics?.jiraTaskDetails]);


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
                Generate activity summaries for a specific user and time frame. Data before {format(LIVE_DATA_START_DATE, "PP")} uses mock patterns.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Report Parameters</CardTitle>
          <CardDescription>Select a user and a date range to generate their activity report.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="user-select-combobox" className="block text-sm font-medium text-foreground mb-1">User</label>
            <Popover open={isUserSelectOpen} onOpenChange={setIsUserSelectOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="user-select-combobox"
                  variant="outline"
                  role="combobox"
                  aria-expanded={isUserSelectOpen}
                  className="w-full justify-between"
                  disabled={isLoadingMsUsers || allMsGraphUsers.length === 0}
                >
                  {isLoadingMsUsers ? "Loading users..." : selectedUser ? selectedUser.displayName : "Select user..."}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder="Search user..." />
                  <CommandList>
                    <CommandEmpty>
                      {isLoadingMsUsers ? "Loading..." : msUsersError ? "Error loading users." : "No user found."}
                    </CommandEmpty>
                    <CommandGroup>
                      {allMsGraphUsers.map((user) => (
                        <CommandItem
                          key={user.id}
                          value={user.displayName || user.userPrincipalName || ""}
                          onSelect={() => {
                            setSelectedUser(user);
                            setIsUserSelectOpen(false);
                            setMetrics(null); 
                            setMetricsError(null);
                            setDataSourceMsg(null);
                          }}
                        >
                          <CheckCircle
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedUser?.id === user.id ? "opacity-100 text-green-500" : "opacity-0"
                            )}
                          />
                          <div>
                            <p>{user.displayName}</p>
                            <p className="text-xs text-muted-foreground">{user.userPrincipalName}</p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {msUsersError && !isLoadingMsUsers && (
              <Alert variant="destructive" className="mt-2 text-xs">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="text-xs">Error Loading Users</AlertTitle>
                <AlertDescription className="text-xs">{msUsersError}</AlertDescription>
              </Alert>
            )}
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label htmlFor="start-date-popover" className="block text-sm font-medium text-foreground mb-1">Start Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="start-date-popover"
                    variant={"outline"}
                    className={cn("w-full justify-start text-left font-normal", !dateRange?.from && "text-muted-foreground")}
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {dateRange?.from ? format(dateRange.from, "LLL dd, yyyy") : <span>Pick a start date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single" selected={dateRange?.from} onSelect={(day) => setDateRange(prev => ({ ...prev, from: day ? startOfDay(day) : undefined }))}
                    disabled={(date) => date > (dateRange?.to || new Date()) || date > new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex-1">
              <label htmlFor="end-date-popover" className="block text-sm font-medium text-foreground mb-1">End Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="end-date-popover"
                    variant={"outline"}
                    className={cn("w-full justify-start text-left font-normal", !dateRange?.to && "text-muted-foreground")}
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
          <Button onClick={handleGenerateReport} disabled={isLoadingMetrics || isLoadingMsUsers || !selectedUser}>
            {isLoadingMetrics ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserSearch className="mr-2 h-4 w-4" />
            )}
            Generate Report
          </Button>
        </CardFooter>
      </Card>

      {isLoadingMetrics && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2 text-muted-foreground">Generating report...</p>
        </div>
      )}
      {metricsError && !isLoadingMetrics && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{metricsError}</AlertDescription>
        </Alert>
      )}
      {dataSourceMsg && !isLoadingMetrics && !metricsError && (
        <Alert variant="default" className="border-blue-500/50 text-blue-700 dark:border-blue-400/50 dark:text-blue-400 shadow-sm">
            <BarChartHorizontalBig className="h-5 w-5 text-blue-600 dark:text-blue-500" />
            <AlertTitle className="font-semibold text-blue-700 dark:text-blue-400">Data Source Note</AlertTitle>
            <AlertDescription className="text-blue-600 dark:text-blue-500">
                {dataSourceMsg}
            </AlertDescription>
        </Alert>
      )}
      {metrics && !isLoadingMetrics && (
        <Card>
          <CardHeader>
            <CardTitle>Activity Summary for {selectedUser?.displayName || "Selected User"}</CardTitle>
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
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="font-medium">Participated Duration:</span>
                </div>
                <span className="font-semibold text-lg">{participatedDurationHours} hours</span>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-md bg-secondary/30">
                <div className="flex items-center gap-2">
                    <MessageSquareText className="h-5 w-5 text-orange-500" />
                    <span className="font-medium">Average Message Response Time:</span>
                </div>
                <span className="font-semibold text-sm text-muted-foreground">(Feature Coming Soon)</span>
            </div>
            
            {(metrics.jiraTaskDetails && metrics.jiraTaskDetails.length > 0) || (metrics.jiraTaskDetails && metrics.jiraTaskDetails.length === 0 && dataSourceMsg?.includes("live data")) ? ( // Show accordion if live and 0, or if tasks exist
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="jira-task-details">
                   <AccordionTrigger className="text-sm font-medium hover:no-underline p-3 border rounded-md bg-secondary/30 data-[state=open]:bg-secondary/40 group">
                     <div className="flex items-center gap-1 text-left flex-wrap">
                        <ListChecksIcon className="h-5 w-5 text-blue-500 shrink-0 mr-1" />
                        <span className="font-semibold">Jira Tasks:</span>
                        <span className="text-xs">(Total: {jiraTaskStatusCounts.total} |</span>
                        <span className="text-xs flex items-center"><CheckCircle className="h-3.5 w-3.5 mr-1 text-green-600 shrink-0"/>Completed: {jiraTaskStatusCounts.completed} |</span>
                        <span className="text-xs flex items-center"><Hourglass className="h-3.5 w-3.5 mr-1 text-yellow-600 shrink-0"/>Ongoing: {jiraTaskStatusCounts.ongoing} |</span>
                        <span className="text-xs flex items-center"><FileQuestion className="h-3.5 w-3.5 mr-1 text-red-500 shrink-0"/>Pending: {jiraTaskStatusCounts.pending})</span>
                        <ChevronDown className="h-5 w-5 text-blue-500 transition-transform duration-200 group-data-[state=open]:rotate-180 ml-auto shrink-0" />
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-1 pb-3 px-3 border rounded-b-md border-t-0">
                    {metrics.jiraTaskDetails.length > 0 ? (
                        <ScrollArea className="h-[200px] mt-2">
                        <ul className="space-y-2">
                            {metrics.jiraTaskDetails.map((task) => (
                            <li key={task.key} className="text-xs border-b pb-1">
                                <p><strong>Key:</strong> {task.key} ({task.type})</p>
                                <p><strong>Summary:</strong> {task.summary}</p>
                                <p><strong>Status:</strong> {task.status} ({task.statusCategoryKey || 'N/A'})</p>
                            </li>
                            ))}
                        </ul>
                        </ScrollArea>
                    ) : (
                        <p className="text-xs text-muted-foreground mt-2">No Jira tasks found for this user in this period.</p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ) : metrics.jiraTaskDetails && metrics.jiraTaskDetails.length === 0 && dataSourceMsg?.includes("mock") ? (
                 <div className="flex items-center justify-between p-3 border rounded-md bg-secondary/30">
                    <div className="flex items-center gap-2">
                        <ListChecksIcon className="h-5 w-5 text-blue-500" />
                        <span className="font-medium">Jira Tasks Worked On (Mock Data):</span>
                    </div>
                    <span className="font-semibold text-lg">0</span>
                </div>
            ) : null}
            
            {metrics.error && (
                 <Alert variant="destructive" className="mt-2">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Partial Data Warning</AlertTitle>
                    <AlertDescription>{metrics.error}. Some metrics might be incomplete.</AlertDescription>
                </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

