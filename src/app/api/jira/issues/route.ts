
import {NextRequest, NextResponse} from 'next/server';

// Placeholder for Jira API integration
// This would typically involve using Jira's REST API with API token authentication.

// const JIRA_INSTANCE_URL = process.env.JIRA_INSTANCE_URL;
// const JIRA_USERNAME = process.env.JIRA_USERNAME; // Basic auth username (often email)
// const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN; // Jira API Token

export async function GET(request: NextRequest) {
  // const { searchParams } = new URL(request.url);
  // const userJiraAccountId = searchParams.get('userJiraAccountId'); // Jira account ID of the user

  // if (!JIRA_INSTANCE_URL || !JIRA_USERNAME || !JIRA_API_TOKEN) {
  //   return NextResponse.json(
  //     { error: "Jira API integration not configured on server." },
  //     { status: 500 }
  //   );
  // }

  // if (!userJiraAccountId) {
  //   return NextResponse.json({ error: "Jira User Account ID is required." }, { status: 400 });
  // }
  
  // TODO: Implement actual Jira API call
  // 1. Construct JQL query to fetch issues assigned to or recently updated by the user.
  //    Example JQL: `assignee = "${userJiraAccountId}" AND updated >= -7d ORDER BY updated DESC`
  // 2. Make request to Jira API: `${JIRA_INSTANCE_URL}/rest/api/3/search?jql=${encodeURIComponent(jql)}`
  // 3. Authenticate using Basic Auth with JIRA_USERNAME and JIRA_API_TOKEN (base64 encoded).
  //    Headers: { 'Authorization': `Basic ${Buffer.from(`${JIRA_USERNAME}:${JIRA_API_TOKEN}`).toString('base64')}` }

  // For now, return mock data or "not implemented"
  console.warn("Jira issues API called, but not fully implemented. Returning mock data.");
  return NextResponse.json({
    message: "Jira issues API - Not fully implemented. This is placeholder data.",
    userJiraAccountId: "mockJiraUser", // Replace with actual userJiraAccountId
    mockIssues: [
      { issueKey: "PROJ-123", summary: "Fix login bug", status: "In Progress", updatedAt: new Date().toISOString(), source: "jira" },
      { issueKey: "PROJ-456", summary: "Develop new feature", status: "To Do", updatedAt: new Date(Date.now() - 86400000).toISOString(), source: "jira" },
    ]
  });
}
