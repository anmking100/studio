
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
  const { searchParams } = new URL(request.url);
  const userEmail = searchParams.get('userEmail');
  const startDateParam = searchParams.get('startDate'); // Expect ISOString
  const endDateParam = searchParams.get('endDate');   // Expect ISOString

  if (!JIRA_INSTANCE_URL || !JIRA_USERNAME || !JIRA_API_TOKEN) {
    console.error("Jira API integration not configured on server. Missing JIRA_INSTANCE_URL, JIRA_USERNAME, or JIRA_API_TOKEN.");
    return NextResponse.json(
      { error: "Jira API integration not configured on server. Admin needs to set environment variables." },
      { status: 503 } 
    );
  }

  if (!userEmail) {
    return NextResponse.json({ error: "Jira User Email (userEmail) is required." }, { status: 400 });
  }
  
  let jql = `assignee = "${userEmail}"`;

  if (startDateParam && endDateParam) {
    try {
        // Format to YYYY-MM-DD HH:mm for JQL
        const formattedStartDate = format(new Date(startDateParam), "yyyy-MM-dd HH:mm");
        const formattedEndDate = format(new Date(endDateParam), "yyyy-MM-dd HH:mm");
        jql += ` AND updated >= "${formattedStartDate}" AND updated <= "${formattedEndDate}"`;
        console.log(`Jira: Fetching for ${userEmail} between ${formattedStartDate} and ${formattedEndDate}`);
    } catch (e) {
        return NextResponse.json({ error: "Invalid date format for startDate or endDate. Please use ISO string." }, { status: 400 });
    }
  } else {
    // Default to last 7 days if no specific date range
    const sevenDaysAgo = format(subDays(new Date(), 7), "yyyy-MM-dd HH:mm");
    const now = format(new Date(), "yyyy-MM-dd HH:mm");
    jql += ` AND updated >= "${sevenDaysAgo}" AND updated <= "${now}"`;
    console.log(`Jira: Fetching for ${userEmail} for last 7 days (default range: ${sevenDaysAgo} to ${now})`);
  }
  jql += ` ORDER BY updated DESC`;
  
  const apiUrl = `${JIRA_INSTANCE_URL}/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary,status,updated,issuetype,priority,labels`;

  try {
    console.log(`Fetching Jira issues for ${userEmail} from ${apiUrl.split('?')[0]} with JQL: ${jql}`);
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${JIRA_USERNAME}:${JIRA_API_TOKEN}`).toString('base64')}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Jira API error for ${userEmail}: Status ${response.status}, Body: ${errorText}`);
      throw new Error(`Jira API request failed with status ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const issues: JiraIssue[] = data.issues || [];
    console.log(`Found ${issues.length} Jira issues for ${userEmail} for the specified period.`);

    const activities: GenericActivityItem[] = issues.map(mapJiraIssueToActivity);
    return NextResponse.json(activities);

  } catch (error: any) {
    console.error(`Error fetching Jira issues for ${userEmail}:`, error.message);
    return NextResponse.json(
        { 
            error: `Failed to retrieve Jira issues for ${userEmail}: ${error.message}. Ensure Jira credentials and instance URL are correct and the user email is valid in Jira.`,
            details: error.toString()
        }, 
        { status: 500 }
    );
  }
}

    