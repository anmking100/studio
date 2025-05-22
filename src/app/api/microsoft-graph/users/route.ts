
import {NextRequest, NextResponse} from 'next/server';
import * as msal from '@azure/msal-node';
import type {MicrosoftGraphUser} from '@/lib/types';

const TENANT_ID = process.env.MS_TENANT_ID;
const CLIENT_ID = process.env.MS_CLIENT_ID;
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET;

if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    'CRITICAL: Missing Microsoft Graph API credentials in environment variables (MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET).'
  );
}

const AUTHORITY = `https://login.microsoftonline.com/${TENANT_ID}`;
const SCOPE = ['https://graph.microsoft.com/.default'];

const msalConfig: msal.Configuration = {
  auth: {
    clientId: CLIENT_ID!,
    authority: AUTHORITY,
    clientSecret: CLIENT_SECRET!,
  },
  // Optional: Add system logging for MSAL
  // system: {
  //   loggerOptions: {
  //     loggerCallback(loglevel, message, containsPii) {
  //       console.log(`MSAL Log (Level ${loglevel}): ${message}`);
  //     },
  //     piiLoggingEnabled: false,
  //     logLevel: msal.LogLevel.Verbose,
  //   }
  // }
};

const confidentialClientApplication =
  new msal.ConfidentialClientApplication(msalConfig);

async function getAccessToken(): Promise<string> {
  const clientCredentialRequest: msal.ClientCredentialRequest = {
    scopes: SCOPE,
  };

  try {
    console.log('Attempting to acquire MS Graph access token...');
    const response = await confidentialClientApplication.acquireTokenByClientCredential(
      clientCredentialRequest
    );
    if (response && response.accessToken) {
      console.log('Successfully acquired MS Graph access token.');
      return response.accessToken;
    } else {
      console.error('Failed to acquire access token, response did not contain accessToken:', response);
      throw new Error('Failed to acquire access token from MSAL.');
    }
  } catch (error: any) {
    console.error('Error acquiring MS Graph token:', error.message || error);
    if (error.errorCode) {
      console.error(`MSAL Error Code: ${error.errorCode}`);
      console.error(`MSAL Error Message: ${error.errorMessage}`);
    }
    throw new Error(`Failed to get MS Graph token: ${error.message || 'Unknown MSAL error'}`);
  }
}

export async function GET(request: NextRequest) {
  console.log('Received request for /api/microsoft-graph/users');
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    console.error('Microsoft Graph API credentials not configured on server.');
    return NextResponse.json(
      {error: 'Server not configured for Microsoft Graph API. Admin needs to set MS_TENANT_ID, MS_CLIENT_ID, and MS_CLIENT_SECRET in .env.'},
      {status: 503} // Service Unavailable
    );
  }

  try {
    const token = await getAccessToken();
    const url =
      'https://graph.microsoft.com/v1.0/users?$select=id,displayName,userPrincipalName,assignedLicenses';
    const headers = {
      Authorization: `Bearer ${token}`,
      ConsistencyLevel: 'eventual', // Required for some $select queries, good practice to include
    };

    console.log(`Fetching users from Microsoft Graph API: ${url}`);
    const graphResponse = await fetch(url, {headers});
    const responseText = await graphResponse.text(); // Read text first to avoid JSON parse error on non-JSON response

    if (!graphResponse.ok) {
      console.error(`Microsoft Graph API error: Status ${graphResponse.status}`);
      console.error(`Response Body: ${responseText}`);
      // Try to parse error for more details if it's JSON
      let errorDetails = responseText;
      try {
        const parsedError = JSON.parse(responseText);
        if (parsedError && parsedError.error && parsedError.error.message) {
          errorDetails = parsedError.error.message;
        }
      } catch (e) { /* Ignore if not JSON */ }
      
      throw new Error(
        `Graph API request failed with status ${graphResponse.status}: ${errorDetails}`
      );
    }

    console.log('Successfully fetched data from Microsoft Graph API.');
    const data = JSON.parse(responseText); // Now parse as JSON

    if (!data || !data.value) {
        console.warn('Microsoft Graph API response did not contain a "value" array. Response data:', data);
        return NextResponse.json([]); // Return empty array if no users or unexpected format
    }
    
    console.log(`Raw users count from Graph API: ${data.value.length}`);
    if (data.value.length > 0) {
        console.log('Sample raw user data from Graph API:', JSON.stringify(data.value[0], null, 2));
    }


    const users: MicrosoftGraphUser[] = data.value.map((user: any) => ({
      id: user.id, // This is the crucial field
      displayName: user.displayName,
      userPrincipalName: user.userPrincipalName,
      assignedLicenses: user.assignedLicenses || [],
    }));
    
    const usersWithIdCount = users.filter(u => u.id).length;
    console.log(`Mapped users count: ${users.length}, Users with valid ID: ${usersWithIdCount}`);
    
    if (users.length > 0 && usersWithIdCount < users.length) {
        console.warn(`Some users (${users.length - usersWithIdCount}) from MS Graph were missing an 'id' field and were filtered out later or will cause issues.`);
    }

    return NextResponse.json(users);
  } catch (error: any) {
    console.error('Error in /api/microsoft-graph/users route:', error.message || error);
    return NextResponse.json(
        {
            error: `Failed to retrieve users from Microsoft Graph: ${error.message || 'An unexpected error occurred.'}. Check server logs for more details. Ensure API permissions (User.Read.All - Application) are granted in Azure and .env variables are correct.`
        }, 
        {status: 500}
    );
  }
}
