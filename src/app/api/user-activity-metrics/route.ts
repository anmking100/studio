
'use server';

import { NextRequest, NextResponse } from 'next/server';
import * as msal from '@azure/msal-node';
import { differenceInMinutes, parseISO, startOfDay, endOfDay, format } from 'date-fns';
import type { UserActivityMetrics, JiraIssue, JiraTaskDetail } from '@/lib/types';

const TENANT_ID = process.env.MS_TENANT_ID;
const CLIENT_ID = process.env.MS_CLIENT_ID;
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET;

const JIRA_INSTANCE_URL = process.env.JIRA_INSTANCE_URL;
const JIRA_USERNAME = process.env.JIRA_USERNAME;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

const SCOPE = ['https://graph.microsoft.com/.default'];
const AUTHORITY = `https://login.microsoftonline.com/${TENANT_ID}`;

const msalConfig: msal.Configuration = {
  auth: {
    clientId: CLIENT_ID!,
    authority: AUTHORITY,
    clientSecret: CLIENT_SECRET!,
  },
};

const confidentialClientApplication = new msal.ConfidentialClientApplication(msalConfig);

async function getAccessToken(): Promise<string> {
  const clientCredentialRequest: msal.ClientCredentialRequest = { scopes: SCOPE };
  try {
    console.log('USER_ACTIVITY_METRICS_API: Attempting to acquire MS Graph access token...');
    const response = await confidentialClientApplication.acquireTokenByClientCredential(clientCredentialRequest);
    if (response && response.accessToken) {
      console.log('USER_ACTIVITY_METRICS_API: Successfully acquired MS Graph access token.');
      return response.accessToken;
    } else {
      console.error('USER_ACTIVITY_METRICS_API: Failed to acquire access token, response did not contain accessToken:', response);
      throw new Error('Failed to acquire access token from MSAL for user activity metrics.');
    }
  } catch (error: any) {
    console.error('USER_ACTIVITY_METRICS_API: Error acquiring MS Graph token for user activity metrics:', error.message || error);
    if (error.errorCode) {
      console.error(`MSAL Error Code: ${error.errorCode}`);
      console.error(`MSAL Error Message: ${error.errorMessage}`);
    }
    throw new Error(`Failed to get MS Graph token for user activity metrics: ${error.message || 'Unknown MSAL error'}`);
  }
}

interface GraphCalendarEvent {
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay?: boolean;
  type?: string; // e.g. "singleInstance", "occurrence", "exception", "seriesMaster"
}

async function fetchJiraTasks(userEmail: string, startDate: string, endDate: string): Promise<JiraTaskDetail[]> {
  if (!JIRA_INSTANCE_URL || !JIRA_USERNAME || !JIRA_API_TOKEN) {
    console.warn("USER_ACTIVITY_METRICS_API (Jira): Jira API integration not configured correctly on server for task count.");
    return [];
  }
  if (!userEmail) {
    console.warn("USER_ACTIVITY_METRICS_API (Jira): User email not provided, cannot fetch Jira tasks.");
    return [];
  }

  try {
    const formattedStartDate = format(parseISO(startDate), "yyyy-MM-dd HH:mm");
    const formattedEndDate = format(parseISO(endDate), "yyyy-MM-dd HH:mm");
    // Fetch key, summary, status, issuetype, and statusCategory for task details
    let jql = `assignee = "${userEmail}" AND updated >= "${formattedStartDate}" AND updated <= "${formattedEndDate}" ORDER BY updated DESC`;
    
    const apiUrl = `${JIRA_INSTANCE_URL}/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=key,summary,status,issuetype,statusCategory`;
    console.log(`USER_ACTIVITY_METRICS_API (Jira): Fetching Jira tasks for ${userEmail}, period: ${formattedStartDate} to ${formattedEndDate}. JQL: ${jql}`);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${JIRA_USERNAME}:${JIRA_API_TOKEN}`).toString('base64')}`,
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`USER_ACTIVITY_METRICS_API (Jira): Jira API request failed for user ${userEmail}. Status: ${response.status}, Body: ${errorText.substring(0,200)}`);
      return []; 
    }

    const data = await response.json();
    const issues: JiraIssue[] = data.issues || [];
    
    const taskDetails: JiraTaskDetail[] = issues.map(issue => ({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        type: issue.fields.issuetype.name,
        statusCategoryKey: issue.fields.status.statusCategory?.key,
    }));

    console.log(`USER_ACTIVITY_METRICS_API (Jira): Fetched ${issues.length} issues, mapped to ${taskDetails.length} JiraTaskDetail objects for ${userEmail}.`);
    return taskDetails;

  } catch (error: any) {
    console.error(`USER_ACTIVITY_METRICS_API (Jira): Unhandled exception fetching Jira tasks for ${userEmail}:`, error.message);
    return [];
  }
}


export async function GET(request: NextRequest) {
  console.log('USER_ACTIVITY_METRICS_API: Received GET request.');
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId'); // MS Graph User ID
  const userEmail = searchParams.get('userEmail'); // User's email for Jira
  const startDateParam = searchParams.get('startDate'); // Expect ISOString
  const endDateParam = searchParams.get('endDate');   // Expect ISOString

  console.log(`USER_ACTIVITY_METRICS_API: Params - userId: ${userId}, userEmail: ${userEmail}, startDate: ${startDateParam}, endDate: ${endDateParam}`);

  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    console.error("USER_ACTIVITY_METRICS_API Error: Microsoft Graph API not configured on server.");
    return NextResponse.json(
      { error: "Server not configured for Microsoft Graph API. Admin needs to set environment variables." },
      { status: 503 }
    );
  }

  if (!userId || !userEmail || !startDateParam || !endDateParam) { 
    return NextResponse.json(
      { error: "Missing required query parameters: userId, userEmail, startDate, and endDate." },
      { status: 400 }
    );
  }

  let startDateTimeFilter: string;
  let endDateTimeFilter: string;

  try {
    startDateTimeFilter = startOfDay(parseISO(startDateParam)).toISOString();
    endDateTimeFilter = endOfDay(parseISO(endDateParam)).toISOString();
    console.log(`USER_ACTIVITY_METRICS_API: Fetching MS Graph calendar events for user ${userId} from ${startDateTimeFilter} to ${endDateTimeFilter}`);
  } catch (e) {
    console.error(`USER_ACTIVITY_METRICS_API Error: Invalid date format for startDate or endDate. Params: ${startDateParam}, ${endDateParam}. Error: ${e}`);
    return NextResponse.json({ error: "Invalid date format for startDate or endDate. Please use ISO string." }, { status: 400 });
  }
  
  let totalMeetingMinutes = 0;
  let meetingCount = 0;
  let jiraTaskDetails: JiraTaskDetail[] = [];
  let apiError = null;

  try {
    const token = await getAccessToken();
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', Prefer: `outlook.timezone="UTC"` };

    const calendarUrl = `https://graph.microsoft.com/v1.0/users/${userId}/calendarView?startDateTime=${encodeURIComponent(startDateTimeFilter)}&endDateTime=${encodeURIComponent(endDateTimeFilter)}&$select=subject,start,end,isAllDay,type&$top=100`;
    console.log(`USER_ACTIVITY_METRICS_API: MS Graph Calendar API URL (params encoded): ${calendarUrl.split('?')[0]}?startDateTime=...`);

    const calendarResponse = await fetch(calendarUrl, { headers, cache: 'no-store' });

    if (calendarResponse.ok) {
      const calendarData = await calendarResponse.json();
      const events: GraphCalendarEvent[] = calendarData.value || [];
      console.log(`USER_ACTIVITY_METRICS_API: Fetched ${events.length} raw MS Graph calendar events for user ${userId}.`);

      events.forEach(event => {
        if (!event.isAllDay && event.type !== 'seriesMaster') {
          try {
            const start = parseISO(event.start.dateTime);
            const end = parseISO(event.end.dateTime);
            const duration = differenceInMinutes(end, start);
            if (duration > 0) {
              totalMeetingMinutes += duration;
              meetingCount++;
            }
          } catch (e) {
            console.warn(`USER_ACTIVITY_METRICS_API: Could not parse dates or calculate duration for MS Graph event: ${event.subject}`, e);
          }
        }
      });
      console.log(`USER_ACTIVITY_METRICS_API: Calculated totalMeetingMinutes: ${totalMeetingMinutes} from ${meetingCount} meetings for user ${userId}.`);
    } else {
      const errorText = await calendarResponse.text();
      const graphError = `Failed to fetch MS Graph calendar events: ${calendarResponse.statusText} - ${errorText.substring(0,100)}`;
      console.error(`USER_ACTIVITY_METRICS_API: Error fetching MS Graph calendar events for user ${userId}. Status: ${calendarResponse.status}, Body: ${errorText.substring(0, 200)}`);
      apiError = graphError;
    }

    // Fetch Jira tasks if userEmail is provided
    if (userEmail) {
        jiraTaskDetails = await fetchJiraTasks(userEmail, startDateParam, endDateParam);
    }


    const metrics: UserActivityMetrics = {
      userId,
      totalMeetingMinutes,
      averageResponseTimeMinutes: null, 
      meetingCount,
      jiraTasksWorkedOnCount: jiraTaskDetails.length,
      jiraTaskDetails: jiraTaskDetails,
      error: apiError || undefined,
    };
    console.log('USER_ACTIVITY_METRICS_API: Successfully processed request. Metrics:', metrics);
    return NextResponse.json(metrics);

  } catch (error: any) {
    console.error(`USER_ACTIVITY_METRICS_API Error: Unhandled exception for user ${userId}:`, error.message, error.stack);
    return NextResponse.json(
      { error: `Failed to retrieve activity metrics for ${userId}: ${error.message}.`, details: error.toString() },
      { status: 500 }
    );
  }
}
