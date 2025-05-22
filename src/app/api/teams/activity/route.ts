
import {NextRequest, NextResponse} from 'next/server';
import * as msal from '@azure/msal-node';
import type { GenericActivityItem } from '@/lib/types';

const TENANT_ID = process.env.MS_TENANT_ID;
const CLIENT_ID = process.env.MS_CLIENT_ID;
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET;

// Required permissions for Microsoft Graph: Presence.Read.All, Calendars.Read
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
  availability: string; // Available, Away, BeRightBack, Busy, DoNotDisturb, InACall, InAConferenceCall, Inactive, InAMeeting, Offline, OffWork, OutOfOffice, PresenceUnknown, Presenting, UrgentInterruptionsOnly.
  activity: string; // Available, Away, BeRightBack, Busy, DoNotDisturb, InACall, InAConferenceCall, Inactive, InAMeeting, Offline, OffWork, OutOfOffice, PresenceUnknown, Presenting, UrgentInterruptionsOnly.
}

interface GraphCalendarEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  organizer?: { emailAddress?: { name?: string; address?: string } };
  isAllDay?: boolean;
  type?: string; // singleInstance, occurrence, exception, seriesMaster
}

function mapPresenceToActivity(presence: GraphPresence, userId: string): GenericActivityItem | null {
  if (presence.availability === 'Offline' || presence.availability === 'PresenceUnknown') {
    return null;
  }
  return {
    type: 'teams_presence_update',
    timestamp: new Date().toISOString(), // Presence is real-time, so use current time
    details: `Presence: ${presence.availability}, Activity: ${presence.activity}`,
    source: 'm365', // Using m365 as source for Teams Graph data
  };
}

function mapCalendarEventToActivity(event: GraphCalendarEvent): GenericActivityItem {
  return {
    type: 'teams_meeting',
    timestamp: event.start.dateTime, // Use event start time
    details: `Meeting: ${event.subject}${event.organizer?.emailAddress?.name ? ` (Organizer: ${event.organizer.emailAddress.name})` : ''}`,
    source: 'm365',
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

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

  try {
    const token = await getAccessToken();
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    let activities: GenericActivityItem[] = [];

    // 1. Fetch Presence
    const presenceUrl = `https://graph.microsoft.com/v1.0/users/${userId}/presence`;
    console.log(`Fetching Teams presence for user ${userId} from ${presenceUrl}`);
    const presenceResponse = await fetch(presenceUrl, { headers });
    if (presenceResponse.ok) {
      const presenceData: GraphPresence = await presenceResponse.json();
      const presenceActivity = mapPresenceToActivity(presenceData, userId);
      if (presenceActivity) activities.push(presenceActivity);
      console.log(`Fetched presence for ${userId}: ${presenceData.availability}`);
    } else {
      const errorText = await presenceResponse.text();
      console.warn(`Could not fetch Teams presence for user ${userId}: Status ${presenceResponse.status}, Body: ${errorText.substring(0,200)}`);
      // Continue, as presence might not be available or permissions might be missing, but calendar might work.
    }

    // 2. Fetch Calendar Events (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const now = new Date();
    const calendarUrl = `https://graph.microsoft.com/v1.0/users/${userId}/calendarView?startDateTime=${sevenDaysAgo.toISOString()}&endDateTime=${now.toISOString()}&$select=id,subject,start,end,organizer,isAllDay,type&$top=50`;
    
    console.log(`Fetching Teams calendar events for user ${userId} from (approx) ${calendarUrl.split('?')[0]}`);
    const calendarResponse = await fetch(calendarUrl, { headers });
    if (calendarResponse.ok) {
      const calendarData = await calendarResponse.json();
      const events: GraphCalendarEvent[] = calendarData.value || [];
      activities.push(...events.filter(event => !event.isAllDay && event.type !== 'seriesMaster').map(mapCalendarEventToActivity)); // Filter out all-day events and series masters
      console.log(`Found ${events.length} calendar events for ${userId}, mapped ${activities.filter(a => a.type === 'teams_meeting').length} as meetings.`);
    } else {
      const errorText = await calendarResponse.text();
      console.warn(`Could not fetch Teams calendar events for user ${userId}: Status ${calendarResponse.status}, Body: ${errorText.substring(0,200)}`);
    }
    
    if (activities.length === 0) {
        console.log(`No Teams activities (presence or meetings) found or mapped for user ${userId}.`);
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
