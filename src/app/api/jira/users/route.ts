
'use server';

import {NextRequest, NextResponse} from 'next/server';
import type { JiraUser } from '@/lib/types';

const JIRA_INSTANCE_URL = process.env.JIRA_INSTANCE_URL;
const JIRA_USERNAME = process.env.JIRA_USERNAME;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

interface JiraApiUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  avatarUrls?: { // Jira provides multiple sizes
    '48x48'?: string;
    '32x32'?: string;
    '24x24'?: string;
    '16x16'?: string;
  };
  active: boolean;
}

function mapJiraApiUserToJiraUser(apiUser: JiraApiUser): JiraUser {
  return {
    accountId: apiUser.accountId,
    displayName: apiUser.displayName,
    emailAddress: apiUser.emailAddress,
    avatarUrl: apiUser.avatarUrls?.['48x48'] || apiUser.avatarUrls?.['32x32'], // Prefer 48x48
  };
}

export async function GET(request: NextRequest) {
  console.log("JIRA USERS API HANDLER: --- START ---");

  if (!JIRA_INSTANCE_URL || !JIRA_USERNAME || !JIRA_API_TOKEN) {
    console.error("JIRA USERS API Error: Jira API integration not configured correctly on server.");
    return NextResponse.json(
      { error: "Jira API integration not configured on server. Admin needs to set environment variables." },
      { status: 503 }
    );
  }
  console.log("JIRA USERS API: Environment variables for Jira connection appear to be set.");

  // The Jira API for finding users is typically /rest/api/3/user/search
  // An empty query can list users, but it's often paginated and might be restricted.
  // For simplicity, we'll try a broad search. Max results can be controlled.
  // query="" is a common way to list users. Add maxResults for safety.
  const maxResults = 50; // Limit the number of users for this demo page
  const apiUrl = `${JIRA_INSTANCE_URL}/rest/api/3/user/search?query=&maxResults=${maxResults}`;
  
  console.log(`JIRA USERS API: Constructed API URL: ${apiUrl}`);

  try {
    console.log(`JIRA USERS API: Attempting to fetch Jira users from host: ${new URL(apiUrl).hostname}`);
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${JIRA_USERNAME}:${JIRA_API_TOKEN}`).toString('base64')}`,
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });

    console.log(`JIRA USERS API: Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`JIRA USERS API Error: Jira API request failed. Status: ${response.status}, StatusText: ${response.statusText}. Body: ${errorText.substring(0, 500)}`);
      console.log(`JIRA USERS API HANDLER: --- END (Error: API Request Failed ${response.status}) ---`);
      return NextResponse.json(
        {
          error: `Jira API request failed with status ${response.status}. Check server logs. Ensure Jira URL & credentials are correct and the integration user has 'Browse users and groups' global permission.`,
          details: `Jira responded with: ${errorText.substring(0, 200)}`,
        },
        { status: response.status }
      );
    }

    const data: JiraApiUser[] = await response.json(); // The endpoint returns an array of users directly
    
    if (data && data.length > 0) {
        console.log(`JIRA USERS API: SUCCESS - Found ${data.length} raw Jira users.`);
        // Filter for active users as inactive users might also be returned
        const activeApiUsers = data.filter(user => user.active);
        console.log(`JIRA USERS API: Filtered to ${activeApiUsers.length} active Jira users.`);
        if (activeApiUsers.length > 0) {
            console.log(`JIRA USERS API: Sample raw active user: AccountID - ${activeApiUsers[0].accountId}, DisplayName - "${activeApiUsers[0].displayName}", Email - ${activeApiUsers[0].emailAddress}`);
        }
        const users: JiraUser[] = activeApiUsers.map(mapJiraApiUserToJiraUser);
        console.log(`JIRA USERS API: Mapped ${users.length} active users to JiraUser format.`);
        console.log("JIRA USERS API HANDLER: --- END (Success) ---");
        return NextResponse.json(users);
    } else {
        console.log(`JIRA USERS API: INFO - Successfully connected to Jira, but NO Jira users found for the query or no active users.`);
        console.log("JIRA USERS API HANDLER: --- END (Success - No Users) ---");
        return NextResponse.json([]);
    }

  } catch (error: any) {
    console.error(`JIRA USERS API Error: Unhandled exception during Jira user fetch. Error: ${error.message}`, error.stack);
    console.log("JIRA USERS API HANDLER: --- END (Error: Unhandled Exception) ---");
    return NextResponse.json(
        {
            error: `Failed to retrieve Jira users: ${error.message}. Check server logs.`,
            details: error.toString()
        },
        { status: 500 }
    );
  }
}
