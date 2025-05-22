
'use server';

import {NextRequest, NextResponse} from 'next/server';
import type { GenericActivityItem, JiraIssue } from '@/lib/types';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

const JIRA_INSTANCE_URL = process.env.JIRA_INSTANCE_URL;
const JIRA_USERNAME = process.env.JIRA_USERNAME;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

function mapJiraIssueToActivity(issue: JiraIssue): GenericActivityItem {
  return {
    type: `jira_issue_${issue.fields.issuetype.name.toLowerCase().replace(/\s+/g, '_')}`,
    timestamp: issue.fields.updated,
    details: `[${issue.key}] ${issue.fields.summary} (Status: ${issue.fields.status.name})`,
    source: 'jira',
    jiraStatusCategoryKey: issue.fields.status.statusCategory?.key,
  };
}

export async function GET(request: NextRequest) {
  console.log("JIRA API HANDLER: --- START ---");

  const { searchParams } = new URL(request.url);
  const userEmail = searchParams.get('userEmail');
  const startDateParam = searchParams.get('startDate'); // Expect ISOString
  const endDateParam = searchParams.get('endDate');   // Expect ISOString

  console.log(`JIRA API: Received Params - userEmail: ${userEmail}, startDate: ${startDateParam}, endDate: ${endDateParam}`);

  if (!JIRA_INSTANCE_URL || !JIRA_USERNAME || !JIRA_API_TOKEN) {
    console.error("JIRA API Error: Jira API integration not configured correctly on server. Missing one or more environment variables: JIRA_INSTANCE_URL, JIRA_USERNAME, JIRA_API_TOKEN.");
    console.log(`JIRA_INSTANCE_URL set: ${!!JIRA_INSTANCE_URL}`);
    console.log(`JIRA_USERNAME set: ${!!JIRA_USERNAME}`);
    console.log(`JIRA_API_TOKEN set: ${!!JIRA_API_TOKEN ? 'Yes (length not shown for security)' : 'No'}`);
    console.log("JIRA API HANDLER: --- END (Error: Missing Env Vars) ---");
    return NextResponse.json(
      { error: "Jira API integration not configured on server. Admin needs to set environment variables." },
      { status: 503 }
    );
  }
  console.log("JIRA API: Environment variables for Jira connection appear to be set.");

  if (!userEmail) {
    console.error("JIRA API Error: Jira User Email (userEmail) is required.");
    console.log("JIRA API HANDLER: --- END (Error: Missing userEmail) ---");
    return NextResponse.json({ error: "Jira User Email (userEmail) is required." }, { status: 400 });
  }

  let jql = `assignee = "${userEmail}"`;

  if (startDateParam && endDateParam) {
    try {
        // Use ISO strings directly for JQL if possible, or format to Jira's expected datetime.
        // Jira JQL date comparison is usually fine with "YYYY-MM-DD HH:mm"
        const formattedStartDate = format(new Date(startDateParam), "yyyy-MM-dd HH:mm");
        const formattedEndDate = format(new Date(endDateParam), "yyyy-MM-dd HH:mm");
        jql += ` AND updated >= "${formattedStartDate}" AND updated <= "${formattedEndDate}"`;
        console.log(`JIRA API: Querying for userEmail="${userEmail}" for specific period: ${formattedStartDate} to ${formattedEndDate}`);
    } catch (e: any) {
        console.error(`JIRA API Error: Invalid date format for startDate or endDate. Error: ${e.message}`);
        console.log("JIRA API HANDLER: --- END (Error: Invalid Date Format) ---");
        return NextResponse.json({ error: "Invalid date format for startDate or endDate. Please use ISO string." }, { status: 400 });
    }
  } else {
    const sevenDaysAgo = format(subDays(startOfDay(new Date()), 7), "yyyy-MM-dd HH:mm");
    const now = format(new Date(), "yyyy-MM-dd HH:mm");
    jql += ` AND updated >= "${sevenDaysAgo}" AND updated <= "${now}"`;
    console.log(`JIRA API: Querying for userEmail="${userEmail}" for default range (approx last 7 days: ${sevenDaysAgo} to ${now}) because no specific date range was provided.`);
  }
  jql += ` ORDER BY updated DESC`;

  // Request statusCategory in fields
  const apiUrl = `${JIRA_INSTANCE_URL}/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary,status,updated,issuetype,priority,labels,statusCategory`;
  console.log(`JIRA API: Constructed API URL (JQL part encoded): ${apiUrl.split('?')[0]}?jql=...`);
  console.log(`JIRA API: Full JQL for query: ${jql}`);


  try {
    console.log(`JIRA API: Attempting to fetch Jira issues for userEmail="${userEmail}" from host: ${new URL(apiUrl).hostname}`);
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${JIRA_USERNAME}:${JIRA_API_TOKEN}`).toString('base64')}`,
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });

    console.log(`JIRA API: Response status for userEmail="${userEmail}" (period starting ${startDateParam || 'N/A'}): ${response.status}`);

    const responseText = await response.text(); 

    if (!response.ok) {
      console.error(`JIRA API Error: Jira API request failed for userEmail="${userEmail}". Status: ${response.status}, StatusText: ${response.statusText}.`);
      console.error(`JIRA API Error: Response Body Snippet: ${responseText.substring(0, 500)}`);
      console.log(`JIRA API HANDLER: --- END (Error: API Request Failed ${response.status}) ---`);
      return NextResponse.json(
        {
          error: `Jira API request failed with status ${response.status}. Check server logs for details. Ensure Jira URL, credentials, and user email validity.`,
          details: `Jira responded with: ${responseText.substring(0, 200)}`,
        },
        { status: response.status }
      );
    }
    
    console.log(`JIRA API: Raw response text snippet for userEmail="${userEmail}": ${responseText.substring(0, 300)}...`);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError: any) {
      console.error(`JIRA API Error: Failed to parse JSON response for userEmail="${userEmail}". Error: ${parseError.message}`);
      console.error(`JIRA API Error: Full raw response text that failed to parse for userEmail="${userEmail}":`, responseText);
      console.log("JIRA API HANDLER: --- END (Error: JSON Parse Failed) ---");
      return NextResponse.json(
        { error: "Failed to parse response from Jira API. Response was not valid JSON.", details: responseText.substring(0, 200) },
        { status: 502 } 
      );
    }

    const issues: JiraIssue[] = data.issues || [];
    console.log(`JIRA API: Raw issues fetched from Jira API for userEmail="${userEmail}": ${issues.length}`);
    
    if (issues.length > 0) {
        console.log(`JIRA API: Full first raw issue object for userEmail="${userEmail}": ${JSON.stringify(issues[0], null, 2)}`);
    } else {
        console.log(`JIRA API: INFO - Successfully connected to Jira for userEmail="${userEmail}", but NO Jira issues found for the JQL query: ${jql}`);
    }

    const activities: GenericActivityItem[] = issues.map(mapJiraIssueToActivity);
    console.log(`JIRA API: Mapped ${activities.length} raw issues to GenericActivityItem format for userEmail="${userEmail}".`);
    if (activities.length > 0) {
        console.log(`JIRA API: Sample mapped activity for userEmail="${userEmail}": type=${activities[0].type}, details="${activities[0].details}", statusCategoryKey=${activities[0].jiraStatusCategoryKey}`);
    } else if (issues.length > 0 && activities.length === 0) { 
        console.warn(`JIRA API: Found ${issues.length} raw issues but mapped 0 activities for userEmail="${userEmail}". Check mapJiraIssueToActivity logic or issue structure if this occurs.`);
    }

    console.log("JIRA API HANDLER: --- END (Success or No Issues Found) ---");
    return NextResponse.json(activities);

  } catch (error: any) {
    console.error(`JIRA API Error: Unhandled exception during Jira fetch for userEmail="${userEmail}". Error: ${error.message}`, error.stack);
    console.log("JIRA API HANDLER: --- END (Error: Unhandled Exception) ---");
    return NextResponse.json(
        {
            error: `Failed to retrieve Jira issues for userEmail="${userEmail}": ${error.message}. Ensure Jira credentials and instance URL are correct and the user email is valid in Jira. Check server logs for call stack.`,
            details: error.toString()
        },
        { status: 500 }
    );
  }
}

