
'use server';

import {NextRequest, NextResponse} from 'next/server';
import type { GenericActivityItem } from '@/lib/types';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

const JIRA_INSTANCE_URL = process.env.JIRA_INSTANCE_URL;
const JIRA_USERNAME = process.env.JIRA_USERNAME;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: {
      name: string;
    };
    updated: string;
    issuetype: {
      name: string;
    };
    priority?: {
      name: string;
    };
    labels?: string[];
  };
}

function mapJiraIssueToActivity(issue: JiraIssue): GenericActivityItem {
  return {
    type: `jira_issue_${issue.fields.issuetype.name.toLowerCase().replace(/\s+/g, '_')}`,
    timestamp: issue.fields.updated,
    details: `[${issue.key}] ${issue.fields.summary} (Status: ${issue.fields.status.name})`,
    source: 'jira',
  };
}

export async function GET(request: NextRequest) {
  console.log("JIRA API: Received GET request");

  const { searchParams } = new URL(request.url);
  const userEmail = searchParams.get('userEmail');
  const startDateParam = searchParams.get('startDate'); // Expect ISOString
  const endDateParam = searchParams.get('endDate');   // Expect ISOString

  console.log(`JIRA API: Params - userEmail: ${userEmail}, startDate: ${startDateParam}, endDate: ${endDateParam}`);

  if (!JIRA_INSTANCE_URL || !JIRA_USERNAME || !JIRA_API_TOKEN) {
    console.error("JIRA API Error: Jira API integration not configured correctly on server. Missing one or more environment variables: JIRA_INSTANCE_URL, JIRA_USERNAME, JIRA_API_TOKEN.");
    console.log(`JIRA_INSTANCE_URL set: ${!!JIRA_INSTANCE_URL}`);
    console.log(`JIRA_USERNAME set: ${!!JIRA_USERNAME}`);
    console.log(`JIRA_API_TOKEN set: ${!!JIRA_API_TOKEN ? 'Yes (length not shown for security)' : 'No'}`);
    return NextResponse.json(
      { error: "Jira API integration not configured on server. Admin needs to set environment variables." },
      { status: 503 }
    );
  }
  console.log("JIRA API: Environment variables for Jira connection appear to be set.");

  if (!userEmail) {
    console.error("JIRA API Error: Jira User Email (userEmail) is required.");
    return NextResponse.json({ error: "Jira User Email (userEmail) is required." }, { status: 400 });
  }

  let jql = `assignee = "${userEmail}"`;

  if (startDateParam && endDateParam) {
    try {
        const formattedStartDate = format(new Date(startDateParam), "yyyy-MM-dd HH:mm");
        const formattedEndDate = format(new Date(endDateParam), "yyyy-MM-dd HH:mm");
        jql += ` AND updated >= "${formattedStartDate}" AND updated <= "${formattedEndDate}"`;
        console.log(`JIRA API: Fetching for ${userEmail} between ${formattedStartDate} and ${formattedEndDate}`);
    } catch (e: any) {
        console.error(`JIRA API Error: Invalid date format for startDate or endDate. Error: ${e.message}`);
        return NextResponse.json({ error: "Invalid date format for startDate or endDate. Please use ISO string." }, { status: 400 });
    }
  } else {
    // Default to last 7 days if no specific date range
    // This logic branch might not be hit if team-overview page always provides dates
    const sevenDaysAgo = format(subDays(new Date(), 7), "yyyy-MM-dd HH:mm");
    const now = format(new Date(), "yyyy-MM-dd HH:mm");
    jql += ` AND updated >= "${sevenDaysAgo}" AND updated <= "${now}"`;
    console.log(`JIRA API: Fetching for ${userEmail} for last 7 days (default range: ${sevenDaysAgo} to ${now}) because no specific date range was provided.`);
  }
  jql += ` ORDER BY updated DESC`;

  const apiUrl = `${JIRA_INSTANCE_URL}/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary,status,updated,issuetype,priority,labels`;
  console.log(`JIRA API: Constructed API URL (JQL part encoded): ${apiUrl}`);
  console.log(`JIRA API: Full JQL query: ${jql}`);


  try {
    console.log(`JIRA API: Attempting to fetch Jira issues for ${userEmail} from host: ${new URL(apiUrl).hostname}`);
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${JIRA_USERNAME}:${JIRA_API_TOKEN}`).toString('base64')}`,
        'Accept': 'application/json',
      },
      cache: 'no-store', // Disable caching for debugging
    });

    console.log(`JIRA API: Response status for ${userEmail}: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`JIRA API Error: Jira API request failed for ${userEmail}. Status: ${response.status}, StatusText: ${response.statusText}. Body: ${errorText.substring(0, 500)}`); // Log more of the error body
      // Do not throw here if you want to return a JSON response, handle it below
      return NextResponse.json(
        {
          error: `Jira API request failed with status ${response.status}. Check server logs for details. Ensure Jira URL, credentials, and user email validity.`,
          details: `Jira responded with: ${errorText.substring(0, 200)}`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    const issues: JiraIssue[] = data.issues || [];
    console.log(`JIRA API: Found ${issues.length} Jira issues for ${userEmail} for the specified period.`);
    if (issues.length > 0) {
        console.log(`JIRA API: Sample issue for ${userEmail}: Key - ${issues[0].key}, Summary - ${issues[0].fields.summary}`);
    }


    const activities: GenericActivityItem[] = issues.map(mapJiraIssueToActivity);
    return NextResponse.json(activities);

  } catch (error: any) {
    console.error(`JIRA API Error: Unhandled exception during Jira fetch for ${userEmail}. Error: ${error.message}`, error.stack);
    return NextResponse.json(
        {
            error: `Failed to retrieve Jira issues for ${userEmail}: ${error.message}. Ensure Jira credentials and instance URL are correct and the user email is valid in Jira. Check server logs for call stack.`,
            details: error.toString()
        },
        { status: 500 }
    );
  }
}
