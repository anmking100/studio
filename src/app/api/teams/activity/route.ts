
import {NextRequest, NextResponse} from 'next/server';
import * as msal from '@azure/msal-node';
import type { GenericActivityItem } from '@/lib/types';
import { startOfDay, endOfDay } from 'date-fns';

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
    const response = await confidentialClientApplication.acquireTokenByClientCredential(clientCredentialRequest);
    if (response && response.accessToken) {
      return response.accessToken;
    } else {
      throw new Error('Failed to acquire access token from MSAL for Teams activity.');
    }
  } catch (error: any) {
    console.error('Error acquiring MS Graph token for Teams activity:', error.message || error);
    throw new Error(`Failed to get MS Graph token for Teams activity: ${error.message || 'Unknown MSAL error'}`);
  }
}

interface GraphPresence {
  id: string;
  availability: string; 
  activity: string; 
}

interface GraphCalendarEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  organizer?: { emailAddress?: { name?: string; address?: string } };
  isAllDay?: boolean;
  type?: string; 
}

function mapPresenceToActivity(presence: GraphPresence, userId: string, eventDate: Date): GenericActivityItem | null {
  // Presence is real-time, so it's only truly relevant for "today".
  // For historical days, we can't get past presence. So, we only add presence if the eventDate is today.
  const today = new Date();
  if (presence.availability === 'Offline' || presence.availability === 'PresenceUnknown' || 
      eventDate.toDateString() !== today.toDateString()) {
    return null;
  }
  return {
    type: 'teams_presence_update',
    timestamp: new Date().toISOString(), // Presence is real-time
    details: `Presence: ${presence.availability}, Activity: ${presence.activity}`,
    source: 'm365', 
  };
}

function mapCalendarEventToActivity(event: GraphCalendarEvent): GenericActivityItem {
  return {
    type: 'teams_meeting',
    timestamp: event.start.dateTime, 
    details: `Meeting: ${event.subject}${event.organizer?.emailAddress?.name ? ` (Organizer: ${event.organizer.emailAddress.name})` : ''}`,
    source: 'm365',
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const startDateParam = searchParams.get('startDate'); // YYYY-MM-DD
  const endDateParam = searchParams.get('endDate');   // YYYY-MM-DD

  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    console.error("Microsoft Graph API (for Teams activity) not configured on server. Missing MS_TENANT_ID, MS_CLIENT_ID, or MS_CLIENT_SECRET.");
    return NextResponse.json(
      { error: "Server not configured for Microsoft Graph API. Admin needs to set environment variables." },
      { status: 503 }
    );
  }

  if (!userId) {
    return NextResponse.json({ error: "User ID (userId) is required." }, { status: 400 });
  }

  let dayToFetch: Date;
  let startDateTimeFilter: string;
  let endDateTimeFilter: string;

  if (startDateParam && endDateParam) {
    dayToFetch = new Date(startDateParam); // Use startDateParam to represent the day for presence check
    startDateTimeFilter = startOfDay(new Date(startDateParam)).toISOString();
    endDateTimeFilter = endOfDay(new Date(endDateParam)).toISOString();
    console.log(`Teams/M365: Fetching for user ${userId} for day ${startDateParam}`);
  } else {
    // Default to today for presence and last 7 days for calendar if no specific date
    dayToFetch = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    startDateTimeFilter = sevenDaysAgo.toISOString();
    endDateTimeFilter = new Date().toISOString();
     console.log(`Teams/M365: Fetching for user ${userId} for last 7 days (default)`);
  }


  try {
    const token = await getAccessToken();
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    let activities: GenericActivityItem[] = [];

    // 1. Fetch Presence (only relevant if dayToFetch is today)
    if (dayToFetch.toDateString() === new Date().toDateString()) {
        const presenceUrl = `https://graph.microsoft.com/v1.0/users/${userId}/presence`;
        console.log(`Fetching Teams presence for user ${userId} from ${presenceUrl}`);
        const presenceResponse = await fetch(presenceUrl, { headers });
        if (presenceResponse.ok) {
        const presenceData: GraphPresence = await presenceResponse.json();
        const presenceActivity = mapPresenceToActivity(presenceData, userId, dayToFetch);
        if (presenceActivity) activities.push(presenceActivity);
        console.log(`Fetched presence for ${userId}: ${presenceData.availability}`);
        } else {
        const errorText = await presenceResponse.text();
        console.warn(`Could not fetch Teams presence for user ${userId}: Status ${presenceResponse.status}, Body: ${errorText.substring(0,200)}`);
        }
    } else {
        console.log(`Teams/M365: Skipping presence fetch for user ${userId} as it's for a past date (${startDateParam}).`);
    }

    // 2. Fetch Calendar Events for the specified day or default range
    const calendarUrl = `https://graph.microsoft.com/v1.0/users/${userId}/calendarView?startDateTime=${startDateTimeFilter}&endDateTime=${endDateTimeFilter}&$select=id,subject,start,end,organizer,isAllDay,type&$top=50`;
    
    console.log(`Fetching Teams calendar events for user ${userId} from (approx) ${calendarUrl.split('?')[0]}`);
    const calendarResponse = await fetch(calendarUrl, { headers });
    if (calendarResponse.ok) {
      const calendarData = await calendarResponse.json();
      const events: GraphCalendarEvent[] = calendarData.value || [];
      activities.push(...events.filter(event => !event.isAllDay && event.type !== 'seriesMaster').map(mapCalendarEventToActivity));
      console.log(`Found ${events.length} calendar events for ${userId} in period, mapped ${activities.filter(a => a.type === 'teams_meeting').length} as meetings.`);
    } else {
      const errorText = await calendarResponse.text();
      console.warn(`Could not fetch Teams calendar events for user ${userId}: Status ${calendarResponse.status}, Body: ${errorText.substring(0,200)}`);
    }
    
    if (activities.length === 0) {
        console.log(`No Teams activities (presence or meetings) found or mapped for user ${userId} for the period.`);
    }

    return NextResponse.json(activities);

  } catch (error: any) {
    console.error(`Error fetching Teams activity for user ${userId}:`, error.message, error.stack);
    return NextResponse.json(
        { 
            error: `Failed to retrieve Teams activity for ${userId}: ${error.message}. Ensure Microsoft Graph permissions (Presence.Read.All, Calendars.Read) are granted.`,
            details: error.toString()
        }, 
        { status: 500 }
    );
  }
}
