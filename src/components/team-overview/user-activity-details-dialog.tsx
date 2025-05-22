
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { GenericActivityItem, TeamMemberFocus } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, ListChecks, CalendarClock, Briefcase, MessageSquare } from "lucide-react";
import { format } from "date-fns";

interface UserActivityDetailsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  member: TeamMemberFocus | null;
  activities: GenericActivityItem[];
  isLoading: boolean;
  error: string | null;
  activityDate?: Date | null;
}

const getSourceIcon = (source: GenericActivityItem['source']) => {
  switch (source) {
    case 'jira':
      return <Briefcase className="h-4 w-4 text-blue-500" />;
    case 'm365':
    case 'teams': // Assuming 'teams' is essentially 'm365' for our current activity types
      return <MessageSquare className="h-4 w-4 text-purple-500" />;
    default:
      return <ListChecks className="h-4 w-4 text-gray-500" />;
  }
};

export function UserActivityDetailsDialog({
  isOpen,
  onOpenChange,
  member,
  activities,
  isLoading,
  error,
  activityDate,
}: UserActivityDetailsDialogProps) {
  if (!member) return null;

  const formattedActivityDate = activityDate ? format(activityDate, "PPP") : "Selected Date";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            Activities for {member.name}
          </DialogTitle>
          <DialogDescription>
            Showing activities for {formattedActivityDate}. Score for this day: {member.currentDayScoreData?.fragmentationScore.toFixed(1) ?? 'N/A'} ({member.currentDayScoreData?.riskLevel ?? 'N/A'})
          </DialogDescription>
        </DialogHeader>

        <div className="flex-grow overflow-hidden">
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Loading activities...</p>
            </div>
          )}
          {error && !isLoading && (
            <Alert variant="destructive" className="my-4">
              <AlertTriangle className="h-5 w-5" />
              <AlertTitle>Error Fetching Activities</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!isLoading && !error && activities.length === 0 && (
            <Alert className="my-4">
              <ListChecks className="h-5 w-5" />
              <AlertTitle>No Activities Found</AlertTitle>
              <AlertDescription>
                No activities were found for {member.name} on {formattedActivityDate}.
              </AlertDescription>
            </Alert>
          )}
          {!isLoading && !error && activities.length > 0 && (
            <ScrollArea className="h-full pr-4">
              <ul className="space-y-4">
                {activities.map((activity, index) => (
                  <li key={index} className="p-4 rounded-md border bg-card shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getSourceIcon(activity.source)}
                        <Badge variant={activity.source === 'jira' ? 'default' : 'secondary'} className={activity.source === 'jira' ? 'bg-blue-500/20 text-blue-700 border-blue-500/50' : 'bg-purple-500/20 text-purple-700 border-purple-500/50'}>
                          {activity.source.toUpperCase()}
                        </Badge>
                        <span className="text-sm font-medium text-foreground capitalize">{activity.type.replace(/_/g, ' ')}</span>
                      </div>
                      <div className="flex items-center text-xs text-muted-foreground">
                        <CalendarClock className="h-3.5 w-3.5 mr-1" />
                        {format(new Date(activity.timestamp), "MMM d, HH:mm")}
                        {activity.durationMinutes && (
                            <span className="ml-2 text-xs text-muted-foreground">({activity.durationMinutes} min)</span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{activity.details || "No additional details."}</p>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
