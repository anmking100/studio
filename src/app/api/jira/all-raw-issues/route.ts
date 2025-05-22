
'use server';

import {NextRequest, NextResponse} from 'next/server';
import type { JiraIssue } from '@/lib/types'; // Import the shared type
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

const JIRA_INSTANCE_URL = process.env.JIRA_INSTANCE_URL;
const JIRA_USERNAME = process.env.JIRA_USERNAME;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

export async function GET(request: NextRequest) {
  console.log("JIRA RAW ISSUES API HANDLER: --- START ---");

  const { searchParams } = new URL(request.url);
  const userEmail = searchParams.get('userEmail');
  const startDateParam = searchParams.get('startDate'); // Expect ISOString
  const endDateParam = searchParams.get('endDate');   // Expect ISOString

  console.log(`JIRA RAW ISSUES API: Received Params - userEmail: ${userEmail}, startDate: ${startDateParam}, endDate: ${endDateParam}`);

  if (!JIRA_INSTANCE_URL || !JIRA_USERNAME || !JIRA_API_TOKEN) {
    console.error("JIRA RAW ISSUES API Error: Jira API integration not configured correctly on server.");
    return NextResponse.json(
      { error: "Jira API integration not configured on server. Admin needs to set environment variables." },
      { status: 503 }
    );
  }
  console.log("JIRA RAW ISSUES API: Environment variables for Jira connection appear to be set.");

  if (!userEmail) {
    console.error("JIRA RAW ISSUES API Error: Jira User Email (userEmail) is required.");
    return NextResponse.json({ error: "Jira User Email (userEmail) is required." }, { status: 400 });
  }

  let jql = `assignee = "${userEmail}"`;

  if (startDateParam && endDateParam) {
    try {
        const formattedStartDate = format(new Date(startDateParam), "yyyy-MM-dd HH:mm");
        const formattedEndDate = format(new Date(endDateParam), "yyyy-MM-dd HH:mm");
        jql += ` AND updated >= "${formattedStartDate}" AND updated <= "${formattedEndDate}"`;
        console.log(`JIRA RAW ISSUES API: Querying for userEmail="${userEmail}" for specific period: ${formattedStartDate} to ${formattedEndDate}`);
    } catch (e: any) {
        console.error(`JIRA RAW ISSUES API Error: Invalid date format for startDate or endDate. Error: ${e.message}`);
        return NextResponse.json({ error: "Invalid date format for startDate or endDate. Please use ISO string." }, { status: 400 });
    }
  } else {
    const sevenDaysAgo = format(subDays(startOfDay(new Date()), 7), "yyyy-MM-dd HH:mm");
    const now = format(new Date(), "yyyy-MM-dd HH:mm");
    jql += ` AND updated >= "${sevenDaysAgo}" AND updated <= "${now}"`;
    console.log(`JIRA RAW ISSUES API: Querying for userEmail="${userEmail}" for default range (approx last 7 days: ${sevenDaysAgo} to ${now}) because no specific date range was provided.`);
  }
  jql += ` ORDER BY updated DESC`;

  // Request all fields to get the complete raw data. You can specify fields if you want to limit.
  const apiUrl = `${JIRA_INSTANCE_URL}/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=*all`;
  console.log(`JIRA RAW ISSUES API: Constructed API URL (JQL part encoded): ${apiUrl.split('?')[0]}?jql=...`);
  console.log(`JIRA RAW ISSUES API: Full JQL for query: ${jql}`);

  try {
    console.log(`JIRA RAW ISSUES API: Attempting to fetch Jira issues for userEmail="${userEmail}" from host: ${new URL(apiUrl).hostname}`);
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${JIRA_USERNAME}:${JIRA_API_TOKEN}`).toString('base64')}`,
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });

    console.log(`JIRA RAW ISSUES API: Response status for userEmail="${userEmail}" (period starting ${startDateParam || 'N/A'}): ${response.status}`);
    const responseText = await response.text();

    if (!response.ok) {
      console.error(`JIRA RAW ISSUES API Error: Jira API request failed for userEmail="${userEmail}". Status: ${response.status}, StatusText: ${response.statusText}.`);
      console.error(`JIRA RAW ISSUES API Error: Response Body Snippet: ${responseText.substring(0, 500)}`);
      return NextResponse.json(
        { error: `Jira API request failed with status ${response.status}.`, details: responseText.substring(0, 200) },
        { status: response.status }
      );
    }
    
    console.log(`JIRA RAW ISSUES API: Raw response text snippet for userEmail="${userEmail}": ${responseText.substring(0, 300)}...`);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError: any) {
      console.error(`JIRA RAW ISSUES API Error: Failed to parse JSON response for userEmail="${userEmail}". Error: ${parseError.message}`);
      console.error(`JIRA RAW ISSUES API Error: Full raw response text that failed to parse for userEmail="${userEmail}":`, responseText);
      return NextResponse.json(
        { error: "Failed to parse response from Jira API. Response was not valid JSON.", details: responseText.substring(0, 200) },
        { status: 502 }
      );
    }

    const issues: JiraIssue[] = data.issues || [];
    console.log(`JIRA RAW ISSUES API: Successfully fetched and parsed ${issues.length} raw Jira issues for userEmail="${userEmail}".`);

    console.log("JIRA RAW ISSUES API HANDLER: --- END (Success or No Issues Found) ---");
    return NextResponse.json(issues);

  } catch (error: any) {
    console.error(`JIRA RAW ISSUES API Error: Unhandled exception during Jira fetch for userEmail="${userEmail}". Error: ${error.message}`, error.stack);
    return NextResponse.json(
        { error: `Failed to retrieve raw Jira issues for userEmail="${userEmail}": ${error.message}.`, details: error.toString() },
        { status: 500 }
    );
  }
}
