
'use server';

import {NextRequest, NextResponse} from 'next/server';
import * as msal from '@azure/msal-node';
import type { GenericActivityItem } from '@/lib/types';
import { startOfDay, endOfDay, parseISO, differenceInMinutes } from 'date-fns';

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
  isOnlineMeeting?: boolean;
  onlineMeeting?: { joinUrl?: string };
  location?: { displayName?: string; locationType?: string; uniqueId?: string; }; // Added location
}

function mapPresenceToActivity(presence: GraphPresence, userId: string, eventDateISO: string): GenericActivityItem | null {
  const today = new Date();
  // Presence is real-time, so it's only truly relevant if the targetDate is the current day.
  // The eventDateISO is the 'endDate' of the requested range. We only care if this endDate is 'today'.
  if (startOfDay(parseISO(eventDateISO)).getTime() !== startOfDay(today).getTime()) {
      // If the requested date for presence is not today, don't include presence activity.
      return null;
  }

  if (presence.availability === 'Offline' || presence.availability === 'PresenceUnknown') {
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
  let durationMinutes: number | undefined = undefined;
  if (event.start?.dateTime && event.end?.dateTime) {
    try {
      const startDate = parseISO(event.start.dateTime);
      const endDate = parseISO(event.end.dateTime);
      durationMinutes = differenceInMinutes(endDate, startDate);
    } catch (e) {
      console.warn(`Could not parse dates or calculate duration for event: ${event.subject}`, e);
    }
  }

  let details = `Meeting: ${event.subject}`;
  if (event.organizer?.emailAddress?.name) {
    details += ` (Organizer: ${event.organizer.emailAddress.name})`;
  }
  // Optionally add location if relevant, but duration is more aligned with Flask script
  // if (event.location?.displayName) {
  //   details += ` Location: ${event.location.displayName}`;
  // }

  return {
    type: 'teams_meeting',
    timestamp: event.start.dateTime, 
    details: details,
    source: 'm365',
    durationMinutes: durationMinutes,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const startDateParam = searchParams.get('startDate'); // Expect ISOString
  const endDateParam = searchParams.get('endDate');   // Expect ISOString

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

  let startDateTimeFilter: string;
  let endDateTimeFilter: string;
  
  if (startDateParam && endDateParam) {
    try {
        // Use the provided dates directly as they are already ISO strings
        startDateTimeFilter = startDateParam;
        endDateTimeFilter = endDateParam;
        console.log(`Teams/M365 API: Fetching for user ${userId} for period ${startDateTimeFilter} to ${endDateTimeFilter}`);
    } catch (e) {
        console.error(`Teams/M365 API Error: Invalid date format for startDate or endDate. Params: ${startDateParam}, ${endDateParam}. Error: ${e}`);
        return NextResponse.json({ error: "Invalid date format for startDate or endDate. Please use ISO string." }, { status: 400 });
    }
  } else {
    // Default to today if no specific date range is provided for some reason
    // Though the TeamOverviewPage should always provide a range.
    const now = new Date();
    startDateTimeFilter = startOfDay(now).toISOString();
    endDateTimeFilter = endOfDay(now).toISOString();
    console.warn(`Teams/M365 API: No date range provided. Defaulting to today for user ${userId}: ${startDateTimeFilter} to ${endDateTimeFilter}`);
  }

  try {
    const token = await getAccessToken();
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', Prefer: `outlook.timezone="UTC"` };
    let activities: GenericActivityItem[] = [];

    // 1. Fetch Presence (only relevant if targetDateForPresenceCheckISO indicates today)
    const presenceUrl = `https://graph.microsoft.com/v1.0/users/${userId}/presence`;
    console.log(`Teams/M365 API: Fetching Teams presence for user ${userId} from ${presenceUrl}`);
    const presenceResponse = await fetch(presenceUrl, { headers });
    if (presenceResponse.ok) {
      const presenceData: GraphPresence = await presenceResponse.json();
      // Pass endDateParam to mapPresenceToActivity to check if presence is relevant for the requested day
      const presenceActivity = mapPresenceToActivity(presenceData, userId, endDateParam || new Date().toISOString());
      if (presenceActivity) {
        activities.push(presenceActivity);
        console.log(`Teams/M365 API: Fetched and mapped presence for ${userId}: ${presenceData.availability}`);
      } else {
        console.log(`Teams/M365 API: Presence data for ${userId} not mapped (e.g., offline or not for current day of range).`);
      }
    } else {
      const errorText = await presenceResponse.text();
      console.warn(`Teams/M365 API: Could not fetch Teams presence for user ${userId}: Status ${presenceResponse.status}, Body: ${errorText.substring(0,200)}`);
    }
    
    // 2. Fetch Calendar Events for the specified day or default range
    // Added isOnlineMeeting, onlineMeeting, location to $select
    const calendarUrl = `https://graph.microsoft.com/v1.0/users/${userId}/calendarView?startDateTime=${encodeURIComponent(startDateTimeFilter)}&endDateTime=${encodeURIComponent(endDateTimeFilter)}&$select=id,subject,start,end,organizer,isAllDay,type,isOnlineMeeting,onlineMeeting,location&$top=50`;
    
    console.log(`Teams/M365 API: Fetching Teams calendar events for user ${userId} from (approx) ${calendarUrl.split('?')[0]} with params: startDateTime=${startDateTimeFilter}, endDateTime=${endDateTimeFilter}`);
    const calendarResponse = await fetch(calendarUrl, { headers });

    if (calendarResponse.ok) {
      const calendarData = await calendarResponse.json();
      const events: GraphCalendarEvent[] = calendarData.value || [];
      // Filter for events that are not all-day and not series masters, then map
      const mappedEvents = events
        .filter(event => !event.isAllDay && event.type !== 'seriesMaster')
        .map(mapCalendarEventToActivity);
      
      activities.push(...mappedEvents);
      console.log(`Teams/M365 API: Found ${events.length} raw calendar events for ${userId} in period, mapped ${mappedEvents.length} as activities (meetings).`);
      if (mappedEvents.length > 0) {
        console.log(`Teams/M365 API: Sample mapped meeting for ${userId}: Subject - "${mappedEvents[0].details}", Duration - ${mappedEvents[0].durationMinutes} mins`);
      }
    } else {
      const errorText = await calendarResponse.text();
      console.warn(`Teams/M365 API: Could not fetch Teams calendar events for user ${userId}: Status ${calendarResponse.status}, Body: ${errorText.substring(0,200)}`);
       // If calendar fetch fails, still return presence if available
    }
    
    if (activities.length === 0) {
        console.log(`Teams/M365 API: No Teams activities (presence or meetings) found or mapped for user ${userId} for the period.`);
    }

    return NextResponse.json(activities);

  } catch (error: any) {
    console.error(`Teams/M365 API Error: Unhandled exception fetching Teams activity for user ${userId}:`, error.message, error.stack);
    return NextResponse.json(
        { 
            error: `Failed to retrieve Teams activity for ${userId}: ${error.message}. Ensure Microsoft Graph permissions (Presence.Read.All, Calendars.Read) are granted.`,
            details: error.toString()
        }, 
        { status: 500 }
    );
  }
}
