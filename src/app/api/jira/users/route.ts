
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

  const maxResults = 50; 
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

    const rawDataFromApi: JiraApiUser[] = await response.json(); 
    
    if (rawDataFromApi && rawDataFromApi.length > 0) {
        console.log(`JIRA USERS API: SUCCESS - Found ${rawDataFromApi.length} raw Jira accounts from API.`);
        // Log the first few raw accounts to help debugging
        console.log("JIRA USERS API: Sample of RAW user data received from Jira (first 3 or less):");
        rawDataFromApi.slice(0, 3).forEach((rawUser, index) => {
            console.log(`Raw User ${index + 1}: accountId=${rawUser.accountId}, displayName=${rawUser.displayName}, emailAddress=${rawUser.emailAddress || 'N/A'}, active=${rawUser.active}`);
        });
        
        // Filter for active users AND users with an email address
        const actualUsers = rawDataFromApi.filter(user => user.active && user.emailAddress && user.emailAddress.trim() !== '');
        console.log(`JIRA USERS API: Filtered to ${actualUsers.length} active Jira users with email addresses.`);

        if (actualUsers.length > 0) {
            console.log(`JIRA USERS API: Sample filtered active user (after our app's filter): AccountID - ${actualUsers[0].accountId}, DisplayName - "${actualUsers[0].displayName}", Email - ${actualUsers[0].emailAddress}`);
        }
        
        const users: JiraUser[] = actualUsers.map(mapJiraApiUserToJiraUser);
        console.log(`JIRA USERS API: Mapped ${users.length} filtered users to JiraUser format for UI display.`);
        console.log("JIRA USERS API HANDLER: --- END (Success) ---");
        return NextResponse.json(users);
    } else {
        console.log(`JIRA USERS API: INFO - Successfully connected to Jira, but NO Jira accounts found by the API query or initial response was empty.`);
        console.log("JIRA USERS API HANDLER: --- END (Success - No Users from API) ---");
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
