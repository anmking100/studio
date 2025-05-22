
'use server';

import {NextRequest, NextResponse} from 'next/server';
import type { JiraIssue } from '@/lib/types'; // Import the shared type
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

const JIRA_INSTANCE_URL = process.env.JIRA_INSTANCE_URL;
const JIRA_USERNAME = process.env.JIRA_USERNAME;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

export async function GET(request: NextRequest) {
  console.log("JIRA RAW ISSUES API HANDLER (ALL ASSIGNED): --- START ---");

  const { searchParams } = new URL(request.url);
  const startDateParam = searchParams.get('startDate'); // Expect ISOString
  const endDateParam = searchParams.get('endDate');   // Expect ISOString

  console.log(`JIRA RAW ISSUES API (ALL ASSIGNED): Received Params - startDate: ${startDateParam}, endDate: ${endDateParam}`);

  if (!JIRA_INSTANCE_URL || !JIRA_USERNAME || !JIRA_API_TOKEN) {
    console.error("JIRA RAW ISSUES API (ALL ASSIGNED) Error: Jira API integration not configured correctly on server.");
    return NextResponse.json(
      { error: "Jira API integration not configured on server. Admin needs to set environment variables." },
      { status: 503 }
    );
  }
  console.log("JIRA RAW ISSUES API (ALL ASSIGNED): Environment variables for Jira connection appear to be set.");

  let jql = `assignee IS NOT EMPTY`;

  if (startDateParam && endDateParam) {
    try {
        const formattedStartDate = format(new Date(startDateParam), "yyyy-MM-dd HH:mm");
        const formattedEndDate = format(new Date(endDateParam), "yyyy-MM-dd HH:mm");
        jql += ` AND updated >= "${formattedStartDate}" AND updated <= "${formattedEndDate}"`;
        console.log(`JIRA RAW ISSUES API (ALL ASSIGNED): Querying for all assigned issues for specific period: ${formattedStartDate} to ${formattedEndDate}`);
    } catch (e: any) {
        console.error(`JIRA RAW ISSUES API (ALL ASSIGNED) Error: Invalid date format for startDate or endDate. Error: ${e.message}`);
        return NextResponse.json({ error: "Invalid date format for startDate or endDate. Please use ISO string." }, { status: 400 });
    }
  } else {
    const sevenDaysAgo = format(subDays(startOfDay(new Date()), 7), "yyyy-MM-dd HH:mm");
    const now = format(new Date(), "yyyy-MM-dd HH:mm");
    jql += ` AND updated >= "${sevenDaysAgo}" AND updated <= "${now}"`;
    console.log(`JIRA RAW ISSUES API (ALL ASSIGNED): Querying for all assigned issues for default range (approx last 7 days: ${sevenDaysAgo} to ${now}) because no specific date range was provided.`);
  }
  jql += ` ORDER BY updated DESC`;

  // Request all fields to get the complete raw data. You can specify fields if you want to limit.
  const apiUrl = `${JIRA_INSTANCE_URL}/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=*all`;
  console.log(`JIRA RAW ISSUES API (ALL ASSIGNED): Constructed API URL (JQL part encoded): ${apiUrl.split('?')[0]}?jql=...`);
  console.log(`JIRA RAW ISSUES API (ALL ASSIGNED): Full JQL for query: ${jql}`);

  try {
    console.log(`JIRA RAW ISSUES API (ALL ASSIGNED): Attempting to fetch Jira issues from host: ${new URL(apiUrl).hostname}`);
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${JIRA_USERNAME}:${JIRA_API_TOKEN}`).toString('base64')}`,
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });

    console.log(`JIRA RAW ISSUES API (ALL ASSIGNED): Response status (period starting ${startDateParam || 'N/A'}): ${response.status}`);
    const responseText = await response.text();

    if (!response.ok) {
      console.error(`JIRA RAW ISSUES API (ALL ASSIGNED) Error: Jira API request failed. Status: ${response.status}, StatusText: ${response.statusText}.`);
      console.error(`JIRA RAW ISSUES API (ALL ASSIGNED) Error: Response Body Snippet: ${responseText.substring(0, 500)}`);
      return NextResponse.json(
        { error: `Jira API request failed with status ${response.status}.`, details: responseText.substring(0, 200) },
        { status: response.status }
      );
    }
    
    console.log(`JIRA RAW ISSUES API (ALL ASSIGNED): Raw response text snippet: ${responseText.substring(0, 300)}...`);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError: any) {
      console.error(`JIRA RAW ISSUES API (ALL ASSIGNED) Error: Failed to parse JSON response. Error: ${parseError.message}`);
      console.error(`JIRA RAW ISSUES API (ALL ASSIGNED) Error: Full raw response text that failed to parse:`, responseText);
      return NextResponse.json(
        { error: "Failed to parse response from Jira API. Response was not valid JSON.", details: responseText.substring(0, 200) },
        { status: 502 }
      );
    }

    const issues: JiraIssue[] = data.issues || [];
    console.log(`JIRA RAW ISSUES API (ALL ASSIGNED): Successfully fetched and parsed ${issues.length} raw Jira issues.`);

    console.log("JIRA RAW ISSUES API (ALL ASSIGNED) HANDLER: --- END (Success or No Issues Found) ---");
    return NextResponse.json(issues);

  } catch (error: any) {
    console.error(`JIRA RAW ISSUES API (ALL ASSIGNED) Error: Unhandled exception during Jira fetch. Error: ${error.message}`, error.stack);
    return NextResponse.json(
        { error: `Failed to retrieve raw Jira issues: ${error.message}.`, details: error.toString() },
        { status: 500 }
    );
  }
}
