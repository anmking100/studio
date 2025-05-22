
import {NextRequest, NextResponse} from 'next/server';
import type { GenericActivityItem } from '@/lib/types';

const JIRA_INSTANCE_URL = process.env.JIRA_INSTANCE_URL;
const JIRA_USERNAME = process.env.JIRA_USERNAME; // Basic auth username (often email)
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN; // Jira API Token

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: {
      name: string;
    };
    updated: string; // ISO 8601 datetime string
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
    type: `jira_issue_${issue.fields.issuetype.name.toLowerCase().replace(/\s+/g, '_')}`, // e.g., jira_issue_bug, jira_issue_story
    timestamp: issue.fields.updated,
    details: `[${issue.key}] ${issue.fields.summary} (Status: ${issue.fields.status.name})`,
    source: 'jira',
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userEmail = searchParams.get('userEmail');

  if (!JIRA_INSTANCE_URL || !JIRA_USERNAME || !JIRA_API_TOKEN) {
    console.error("Jira API integration not configured on server. Missing JIRA_INSTANCE_URL, JIRA_USERNAME, or JIRA_API_TOKEN.");
    return NextResponse.json(
      { error: "Jira API integration not configured on server. Admin needs to set environment variables." },
      { status: 503 } // Service Unavailable
    );
  }

  if (!userEmail) {
    return NextResponse.json({ error: "Jira User Email (userEmail) is required." }, { status: 400 });
  }
  
  const jql = `assignee = "${userEmail}" AND updated >= -7d ORDER BY updated DESC`;
  const apiUrl = `${JIRA_INSTANCE_URL}/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary,status,updated,issuetype,priority,labels`;

  try {
    console.log(`Fetching Jira issues for ${userEmail} from ${apiUrl}`);
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
    console.log(`Found ${issues.length} Jira issues for ${userEmail}.`);

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
