
"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, UserSearch, CalendarDays, BarChartHorizontalBig, Clock, CheckCircle, ListChecksIcon, ChevronDown, FileQuestion, Hourglass, MessageSquareText, LineChart as LineChartIcon, BarChart2 as BarChart2Icon, ListFilter } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { DateRange } from "react-day-picker";
import { format, startOfDay, subDays, endOfDay, parseISO, eachDayOfInterval, isBefore } from "date-fns";
import { cn } from "@/lib/utils";
import type { UserActivityMetrics, MicrosoftGraphUser, JiraTaskDetail, GenericActivityItem, CalculateFragmentationScoreInputType, CalculateFragmentationScoreOutput } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { calculateScoreAlgorithmically } from "@/lib/score-calculator";
import { Label } from "@/components/ui/label";
import { getConsistentMockActivitiesForDay } from "@/lib/mock-activity-generator";
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
  Bar,
  CartesianGrid,
} from "recharts";
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { ChatbotWidget } from "@/components/chatbot/ChatbotWidget";


const LIVE_DATA_START_DATE = startOfDay(new Date('2025-05-22T00:00:00.000Z'));

interface DailyChartDataPoint {
  date: string; 
  isoDate: string; 
  fragmentationScore: number | null;
  meetingHours: number;
  jiraCompleted: number;
  jiraOngoing: number;
  jiraPending: number;
}

const stressChartConfig = {
  score: { label: "Score", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig;

const meetingHoursChartConfig = {
  hours: { label: "Meeting Hours", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

const jiraTasksChartConfig = {
  completed: { label: "Completed", color: "hsl(var(--chart-3))" }, 
  ongoing: { label: "Ongoing", color: "hsl(var(--chart-4))" },   
  pending: { label: "Pending", color: "hsl(var(--chart-5))" },   
} satisfies ChartConfig;


// Helper to calculate metrics from mock activities for the report page
function calculateMetricsFromMockActivities(activities: GenericActivityItem[], userId: string): UserActivityMetrics {
  let totalMeetingMinutes = 0;
  const jiraTaskDetails: JiraTaskDetail[] = [];
  
  activities.forEach((activity, index) => {
    if (activity.type === 'teams_meeting' && activity.durationMinutes) {
      totalMeetingMinutes += activity.durationMinutes;
    }
    if (activity.source === 'jira' && activity.type.startsWith('jira_issue_')) {
      const detail: JiraTaskDetail = {
        key: `MOCK-${activity.details?.substring(0,10) || Math.random().toString(36).substring(2, 7)}-${index}`,
        summary: activity.details || "Mock Jira Task",
        status: activity.jiraStatusCategoryKey === 'done' ? 'Done' : activity.jiraStatusCategoryKey === 'indeterminate' ? 'In Progress' : 'To Do',
        type: activity.type.replace('jira_issue_', ''),
        statusCategoryKey: activity.jiraStatusCategoryKey,
      };
      jiraTaskDetails.push(detail);
    }
  });

  return {
    userId,
    totalMeetingMinutes,
    averageResponseTimeMinutes: null,
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
  
  const [dailyChartData, setDailyChartData] = useState<DailyChartDataPoint[]>([]);
  const [isLoadingChartData, setIsLoadingChartData] = useState(false);
  const [isLiveDataPeriodForGraphs, setIsLiveDataPeriodForGraphs] = useState(false);

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
      } catch (err: any)
      {
        console.error("Error fetching MS Graph users for report page:", err);
        setMsUsersError(err.message || "An unknown error occurred while fetching users.");
      } finally {
        setIsLoadingMsUsers(false);
      }
    };
    fetchMsGraphUsers();
  }, []);

  const handleGenerateReport = async () => {
    if (!selectedUser || !selectedUser.id) {
      setMetricsError("Please select a user.");
      return;
    }
    if (!dateRange?.from || !dateRange?.to) {
      setMetricsError("Please select a valid date range.");
      return;
    }

    setIsLoadingMetrics(true);
    setIsLoadingChartData(true);
    setMetricsError(null);
    setMetrics(null);
    setDailyChartData([]);
    
    const useMockDataForPeriod = isBefore(dateRange.to, LIVE_DATA_START_DATE);
    setIsLiveDataPeriodForGraphs(!useMockDataForPeriod);

    if (useMockDataForPeriod) {
      console.log(`USER ACTIVITY REPORT: Using MOCK data for range ${format(dateRange.from, "yyyy-MM-dd")} to ${format(dateRange.to, "yyyy-MM-dd")} for user ${selectedUser.displayName}`);
      
      const daysInSelectedRange = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
      let aggregatedMockActivitiesForRange: GenericActivityItem[] = [];
      const newDailyChartDataPoints: DailyChartDataPoint[] = [];

      for (const day of daysInSelectedRange) {
        const mockActivitiesForDay = getConsistentMockActivitiesForDay(selectedUser.id!, day);
        aggregatedMockActivitiesForRange.push(...mockActivitiesForDay);

        const scoreInput: CalculateFragmentationScoreInputType = {
            userId: selectedUser.id!,
            activities: mockActivitiesForDay,
            activityWindowDays: 1
        };
        const scoreResult: CalculateFragmentationScoreOutput = calculateScoreAlgorithmically(scoreInput);
        
        const dailyMeetingMinutes = mockActivitiesForDay
            .filter(a => a.type === 'teams_meeting' && a.durationMinutes)
            .reduce((sum, a) => sum + (a.durationMinutes || 0), 0);

        let dailyJiraCompleted = 0;
        let dailyJiraOngoing = 0;
        let dailyJiraPending = 0;

        mockActivitiesForDay.filter(a => a.source === 'jira').forEach(task => {
            if (task.jiraStatusCategoryKey === 'done') dailyJiraCompleted++;
            else if (task.jiraStatusCategoryKey === 'indeterminate') dailyJiraOngoing++;
            else if (task.jiraStatusCategoryKey === 'new') dailyJiraPending++;
            else dailyJiraOngoing++; 
        });
        
        newDailyChartDataPoints.push({
            date: format(day, "MMM d"),
            isoDate: day.toISOString(),
            fragmentationScore: scoreResult.fragmentationScore ?? null,
            meetingHours: parseFloat((dailyMeetingMinutes / 60).toFixed(1)),
            jiraCompleted: dailyJiraCompleted,
            jiraOngoing: dailyJiraOngoing,
            jiraPending: dailyJiraPending,
        });
      }
      
      const mockMetrics = calculateMetricsFromMockActivities(aggregatedMockActivitiesForRange, selectedUser.id!);
      const sortedDailyChartData = newDailyChartDataPoints.sort((a,b) => new Date(a.isoDate).getTime() - new Date(b.isoDate).getTime());
      
      console.log("USER ACTIVITY REPORT: Populating dailyChartData (mock period) with:", sortedDailyChartData);
      setDailyChartData(sortedDailyChartData);
      setMetrics(mockMetrics);
      setIsLoadingMetrics(false);
      setIsLoadingChartData(false);

    } else { 
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
          console.warn(`User ${selectedUser.displayName} (ID: ${selectedUser.id}) is missing userPrincipalName. Jira tasks might not be fetched for live data.`);
        }

        const response = await fetch(`/api/user-activity-metrics?${params.toString()}`);
        const responseData = await response.json();

        if (!response.ok) {
          throw new Error(responseData.error || responseData.details || `Failed to fetch activity metrics: ${response.statusText}`);
        }
        setMetrics(responseData as UserActivityMetrics);
        setDailyChartData([]); 
        console.log("USER ACTIVITY REPORT: Live data fetched. Daily chart data for live periods is not currently generated by this API's aggregated metrics.");
      } catch (err: any) {
        console.error("Error fetching user activity metrics (live):", err);
        setMetricsError(err.message || "An unknown error occurred while fetching live metrics.");
      } finally {
        setIsLoadingMetrics(false);
        setIsLoadingChartData(false);
      }
    }
  };

  const totalMeetingHours = metrics?.totalMeetingMinutes ? (metrics.totalMeetingMinutes / 60).toFixed(1) : "0.0";
  const participatedDurationMinutes = metrics?.totalMeetingMinutes ? metrics.totalMeetingMinutes * 0.7 : 0;
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
        } else if (statusKey === 'new') { // Typically 'new' or 'todo' category for pending
          acc.pending++;
        } else if (statusKey !== '') { // Catch-all for other non-done statuses as ongoing
           acc.ongoing++; // Default to ongoing if not 'done' or explicitly 'new'
        }
        return acc;
      },
      { completed: 0, ongoing: 0, pending: 0 }
    );
    return { ...counts, total: metrics.jiraTaskDetails.length };
  }, [metrics?.jiraTaskDetails]);

  const showCharts = !isLoadingChartData && dailyChartData.length > 0 && !isLiveDataPeriodForGraphs;
  console.log("USER ACTIVITY REPORT: Chart rendering check -> isLoadingChartData:", isLoadingChartData, "dailyChartData.length:", dailyChartData.length, "isLiveDataPeriodForGraphs:", isLiveDataPeriodForGraphs, "showCharts:", showCharts);


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
                Metrics for periods ending before {format(LIVE_DATA_START_DATE, "PP")} use consistent mock patterns. Live data otherwise. Charts show daily trends for mock data periods.
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
            <Label htmlFor="user-select-combobox" className="block text-sm font-medium text-foreground mb-1">User</Label>
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
                            setDailyChartData([]);
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
              <Label htmlFor="start-date-popover" className="block text-sm font-medium text-foreground mb-1">Start Date</Label>
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
              <Label htmlFor="end-date-popover" className="block text-sm font-medium text-foreground mb-1">End Date</Label>
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
          <Button onClick={handleGenerateReport} disabled={isLoadingMetrics || isLoadingMsUsers || !selectedUser || isLoadingChartData}>
            {isLoadingMetrics || isLoadingChartData ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserSearch className="mr-2 h-4 w-4" />
            )}
            Generate Report
          </Button>
        </CardFooter>
      </Card>

      {(isLoadingMetrics || isLoadingChartData) && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2 text-muted-foreground">Generating report and charts...</p>
        </div>
      )}
      {metricsError && !isLoadingMetrics && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{metricsError}</AlertDescription>
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
                    <MessageSquareText className="h-5 w-5 text-purple-500" />
                    <span className="font-medium">Average Message Response Time:</span>
                </div>
                <span className="font-semibold text-sm text-muted-foreground">(Feature Coming Soon)</span>
            </div>
            
            {(metrics.jiraTaskDetails) ? (
                (metrics.jiraTaskDetails.length > 0 || (jiraTaskStatusCounts.total > 0 && useMockDataForPeriod)) ? (
                    <Accordion type="single" collapsible className="w-full" defaultValue="jira-task-summary">
                    <AccordionItem value="jira-task-summary">
                        <AccordionTrigger className="text-sm font-medium hover:no-underline p-3 border rounded-md bg-secondary/30 data-[state=open]:bg-secondary/40 group">
                            <div className="flex items-center gap-1 text-left flex-wrap w-full">
                                <ListChecksIcon className="h-5 w-5 text-blue-500 shrink-0 mr-1" />
                                <span className="font-semibold mr-1">Jira Tasks:</span>
                                <span className="text-xs flex items-center mr-1">(Total: {jiraTaskStatusCounts.total} |</span>
                                <span className="text-xs flex items-center mr-1"><CheckCircle className="h-3.5 w-3.5 mr-0.5 text-green-600 shrink-0"/>Completed: {jiraTaskStatusCounts.completed} |</span>
                                <span className="text-xs flex items-center mr-1"><Hourglass className="h-3.5 w-3.5 mr-0.5 text-yellow-600 shrink-0"/>Ongoing: {jiraTaskStatusCounts.ongoing} |</span>
                                <span className="text-xs flex items-center"><FileQuestion className="h-3.5 w-3.5 mr-0.5 text-red-500 shrink-0"/>Pending: {jiraTaskStatusCounts.pending})</span>
                                <ChevronDown className="h-5 w-5 text-blue-500 transition-transform duration-200 group-data-[state=open]:rotate-180 ml-auto shrink-0" />
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-1 pb-3 px-3 border rounded-b-md border-t-0">
                              <ScrollArea className="h-[200px] mt-2">
                              <ul className="space-y-2">
                                  {metrics.jiraTaskDetails.map((task) => (
                                  <li key={task.key} className="text-xs border-b pb-1">
                                      <p><strong>Key:</strong> {task.key} ({task.type})</p>
                                      <p><strong>Summary:</strong> {task.summary}</p>
                                      <p><strong>Status:</strong> {task.status} (Category: {task.statusCategoryKey || 'N/A'})</p>
                                  </li>
                                  ))}
                              </ul>
                              </ScrollArea>
                        </AccordionContent>
                    </AccordionItem>
                    </Accordion>
                ) : (
                    <div className="flex items-center justify-between p-3 border rounded-md bg-secondary/30">
                        <div className="flex items-center gap-2">
                            <ListChecksIcon className="h-5 w-5 text-blue-500" />
                             <span className="font-medium">Jira Tasks Worked On:</span>
                        </div>
                         <span className="font-semibold text-lg">
                           {isLiveDataPeriodForGraphs || useMockDataForPeriod ? jiraTaskStatusCounts.total : "0"}
                        </span>
                    </div>
                )
            ) : (
                <div className="flex items-center justify-between p-3 border rounded-md bg-secondary/30">
                    <div className="flex items-center gap-2">
                        <ListChecksIcon className="h-5 w-5 text-blue-500" />
                        <span className="font-medium">Jira Tasks Worked On:</span>
                    </div>
                    <span className="font-semibold text-lg">Loading...</span>
                </div>
            )}
           
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
      
      {showCharts && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
            <Card className="shadow-md">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <LineChartIcon className="h-5 w-5 text-destructive" />
                  <CardTitle className="text-md font-semibold">Daily Stress Load (Fragmentation)</CardTitle>
                </div>
                <CardDescription>Based on daily activity patterns.</CardDescription>
              </CardHeader>
              <CardContent className="h-[250px]">
                <ChartContainer config={stressChartConfig}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyChartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" style={{ fontSize: '10px' }} />
                      <YAxis domain={[0, 5]} style={{ fontSize: '10px' }} tickFormatter={(val) => typeof val === 'number' ? val.toFixed(1) : String(val) } />
                      <Tooltip content={<ChartTooltipContent indicator="line" />} />
                      <Line type="monotone" dataKey="fragmentationScore" stroke="var(--color-score)" strokeWidth={2} dot={{ r: 3 }} name="Score" />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card className="shadow-md">
              <CardHeader>
                  <div className="flex items-center gap-2">
                      <BarChart2Icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-md font-semibold">Daily Meeting Hours</CardTitle>
                  </div>
                <CardDescription>Based on daily activity patterns.</CardDescription>
              </CardHeader>
              <CardContent className="h-[250px]">
                <ChartContainer config={meetingHoursChartConfig}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyChartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" style={{ fontSize: '10px' }} />
                      <YAxis style={{ fontSize: '10px' }} tickFormatter={(val) => typeof val === 'number' ? val.toFixed(1) : String(val) }/>
                      <Tooltip content={<ChartTooltipContent indicator="line" />} />
                      <Bar dataKey="meetingHours" fill="var(--color-hours)" radius={[4, 4, 0, 0]} name="Meeting Hours" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card className="shadow-md">
              <CardHeader>
                  <div className="flex items-center gap-2">
                      <ListFilter className="h-5 w-5 text-blue-500" />
                      <CardTitle className="text-md font-semibold">Daily Jira Tasks by Status</CardTitle>
                  </div>
                <CardDescription>Based on daily activity patterns.</CardDescription>
              </CardHeader>
              <CardContent className="h-[250px]">
                <ChartContainer config={jiraTasksChartConfig}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyChartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" style={{ fontSize: '10px' }} />
                      <YAxis style={{ fontSize: '10px' }} allowDecimals={false} />
                      <Tooltip content={<ChartTooltipContent indicator="line" />} />
                      <Legend wrapperStyle={{ fontSize: '10px' }} />
                      <Bar dataKey="jiraCompleted" stackId="a" fill="var(--color-completed)" radius={[4, 4, 0, 0]} name="Completed" />
                      <Bar dataKey="jiraOngoing" stackId="a" fill="var(--color-ongoing)" radius={[0,0,0,0]} name="Ongoing" />
                      <Bar dataKey="jiraPending" stackId="a" fill="var(--color-pending)" radius={[0,0,0,0]} name="Pending" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        </>
      )}
      <ChatbotWidget 
        pageContext={selectedUser && metrics ? {
          userId: selectedUser.id,
          userName: selectedUser.displayName || selectedUser.userPrincipalName || undefined,
          // Pass other relevant data if available for the chatbot
        } : undefined}
      />
    </div>
  );
}

