
import type { GenericActivityItem } from '@/lib/types';
import { subDays, startOfDay, endOfDay, format, parseISO, isEqual, isWithinInterval, isBefore, addHours, differenceInMinutes } from 'date-fns';

// Helper to generate consistent mock activities for a given user and day
export function getConsistentMockActivitiesForDay(userId: string, day: Date): GenericActivityItem[] {
  const activities: GenericActivityItem[] = [];
  const dayOfMonth = day.getUTCDate(); // Use UTC date for consistency
  // Create a somewhat unique number from user ID for varied patterns
  const userIdInt = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

  // Mock meetings - pattern based on day and userIdInt
  if ((dayOfMonth + userIdInt) % 4 === 1) { // Meeting every ~4 days, varies by user
    activities.push({
      type: 'teams_meeting',
      timestamp: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 10 + (userIdInt % 3), 0, 0)).toISOString(),
      details: `Mock Sync Meeting for user ID slice ${userId.substring(0,5)} on day ${dayOfMonth}`,
      source: 'm365',
      durationMinutes: 30 + ((userIdInt % 3) * 10),
    });
  }
  if ((dayOfMonth + userIdInt + 2) % 5 === 0) { // Another meeting pattern
     activities.push({
      type: 'teams_meeting',
      timestamp: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 14 + (userIdInt % 2), 30, 0)).toISOString(),
      details: `Afternoon Mock Huddle for user ID slice ${userId.substring(0,5)}`,
      source: 'm365',
      durationMinutes: 20 + ((userIdInt % 2) * 5),
    });
  }

  // Mock Jira tasks
  const numJiraTasks = (dayOfMonth % 3) + (userIdInt % 2) + 1; // 1 to 3 mock jira tasks
  for (let i = 0; i < numJiraTasks; i++) {
    const isDone = (dayOfMonth + i + userIdInt) % 3 === 0; // Some tasks are done
    const taskType = (i + userIdInt) % 2 === 0 ? 'jira_issue_task' : 'jira_issue_bug';
    activities.push({
      type: taskType,
      timestamp: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 9 + i + (userIdInt % 4), 15 * i, 0)).toISOString(),
      details: `Mock Jira ${taskType.split('_').pop()} ${i+1} for user ID slice ${userId.substring(0,5)} on day ${dayOfMonth}`,
      source: 'jira',
      jiraStatusCategoryKey: isDone ? 'done' : ((dayOfMonth + i) % 2 === 0 ? 'indeterminate' : 'new'),
    });
  }
  
  // Ensure activities are sorted by timestamp
  return activities.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}
