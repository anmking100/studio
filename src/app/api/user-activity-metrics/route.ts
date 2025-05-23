
'use server';

import { NextRequest, NextResponse } from 'next/server';
import * as msal from '@azure/msal-node';
import { differenceInMinutes, parseISO, startOfDay, endOfDay } from 'date-fns';
import type { UserActivityMetrics } from '@/lib/types';

const TENANT_ID = process.env.MS_TENANT_ID;
const CLIENT_ID = process.env.MS_CLIENT_ID;
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET;

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

export async function GET(request: NextRequest) {
  console.log('USER_ACTIVITY_METRICS_API: Received GET request.');
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const startDateParam = searchParams.get('startDate'); // Expect ISOString
  const endDateParam = searchParams.get('endDate');   // Expect ISOString

  console.log(`USER_ACTIVITY_METRICS_API: Params - userId: ${userId}, startDate: ${startDateParam}, endDate: ${endDateParam}`);

  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    console.error("USER_ACTIVITY_METRICS_API Error: Microsoft Graph API not configured on server.");
    return NextResponse.json(
      { error: "Server not configured for Microsoft Graph API. Admin needs to set environment variables." },
      { status: 503 }
    );
  }

  if (!userId || !startDateParam || !endDateParam) {
    return NextResponse.json(
      { error: "Missing required query parameters: userId, startDate, and endDate." },
      { status: 400 }
    );
  }

  let startDateTimeFilter: string;
  let endDateTimeFilter: string;

  try {
    startDateTimeFilter = startOfDay(parseISO(startDateParam)).toISOString();
    endDateTimeFilter = endOfDay(parseISO(endDateParam)).toISOString();
    console.log(`USER_ACTIVITY_METRICS_API: Fetching calendar events for user ${userId} from ${startDateTimeFilter} to ${endDateTimeFilter}`);
  } catch (e) {
    console.error(`USER_ACTIVITY_METRICS_API Error: Invalid date format for startDate or endDate. Params: ${startDateParam}, ${endDateParam}. Error: ${e}`);
    return NextResponse.json({ error: "Invalid date format for startDate or endDate. Please use ISO string." }, { status: 400 });
  }

  try {
    const token = await getAccessToken();
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', Prefer: `outlook.timezone="UTC"` };

    const calendarUrl = `https://graph.microsoft.com/v1.0/users/${userId}/calendarView?startDateTime=${encodeURIComponent(startDateTimeFilter)}&endDateTime=${encodeURIComponent(endDateTimeFilter)}&$select=subject,start,end,isAllDay,type&$top=100`; // Increased top to 100
    console.log(`USER_ACTIVITY_METRICS_API: Calendar API URL (params encoded): ${calendarUrl.split('?')[0]}?startDateTime=...`);

    const calendarResponse = await fetch(calendarUrl, { headers, cache: 'no-store' });
    let totalMeetingMinutes = 0;
    let meetingCount = 0;

    if (calendarResponse.ok) {
      const calendarData = await calendarResponse.json();
      const events: GraphCalendarEvent[] = calendarData.value || [];
      console.log(`USER_ACTIVITY_METRICS_API: Fetched ${events.length} raw calendar events for user ${userId}.`);

      events.forEach(event => {
        // Filter out all-day events and series masters, similar to teams activity route
        if (!event.isAllDay && event.type !== 'seriesMaster') {
          try {
            const start = parseISO(event.start.dateTime);
            const end = parseISO(event.end.dateTime);
            const duration = differenceInMinutes(end, start);
            if (duration > 0) { // Only count events with a positive duration
              totalMeetingMinutes += duration;
              meetingCount++;
            }
          } catch (e) {
            console.warn(`USER_ACTIVITY_METRICS_API: Could not parse dates or calculate duration for event: ${event.subject}`, e);
          }
        }
      });
      console.log(`USER_ACTIVITY_METRICS_API: Calculated totalMeetingMinutes: ${totalMeetingMinutes} from ${meetingCount} meetings for user ${userId}.`);
    } else {
      const errorText = await calendarResponse.text();
      console.error(`USER_ACTIVITY_METRICS_API: Error fetching calendar events for user ${userId}. Status: ${calendarResponse.status}, Body: ${errorText.substring(0, 200)}`);
      // Do not throw an error here, return what we have or default values
      return NextResponse.json(
        { userId, totalMeetingMinutes: 0, averageResponseTimeMinutes: null, meetingCount: 0, error: `Failed to fetch calendar events: ${calendarResponse.statusText}` },
        { status: calendarResponse.status }
      );
    }

    const metrics: UserActivityMetrics = {
      userId,
      totalMeetingMinutes,
      averageResponseTimeMinutes: null, // Placeholder
      meetingCount,
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
