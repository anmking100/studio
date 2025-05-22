
import {NextRequest, NextResponse} from 'next/server';
import * as msal from '@azure/msal-node';
import type {MicrosoftGraphUser} from '@/lib/types';

const TENANT_ID = process.env.MS_TENANT_ID;
const CLIENT_ID = process.env.MS_CLIENT_ID;
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET;

if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    'Missing Microsoft Graph API credentials in environment variables.'
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
};

const confidentialClientApplication =
  new msal.ConfidentialClientApplication(msalConfig);

async function getAccessToken(): Promise<string> {
  const clientCredentialRequest: msal.ClientCredentialRequest = {
    scopes: SCOPE,
  };

  try {
    const response = await confidentialClientApplication.acquireTokenByClientCredential(
      clientCredentialRequest
    );
    if (response && response.accessToken) {
      return response.accessToken;
    } else {
      throw new Error('Failed to acquire access token.');
    }
  } catch (error) {
    console.error('Error acquiring token:', error);
    throw new Error(`Failed to get token: ${error}`);
  }
}

export async function GET(request: NextRequest) {
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json(
      {error: 'Server not configured for Microsoft Graph API.'},
      {status: 500}
    );
  }

  try {
    const token = await getAccessToken();
    const url =
      'https://graph.microsoft.com/v1.0/users?$select=displayName,userPrincipalName,assignedLicenses';
    const headers = {
      Authorization: `Bearer ${token}`,
      ConsistencyLevel: 'eventual', // Required for some $select queries
    };

    const graphResponse = await fetch(url, {headers});

    if (!graphResponse.ok) {
      const errorText = await graphResponse.text();
      console.error('Microsoft Graph API error:', errorText);
      throw new Error(
        `Graph API request failed with status ${graphResponse.status}: ${errorText}`
      );
    }

    const data = await graphResponse.json();
    const users: MicrosoftGraphUser[] = data.value.map((user: any) => ({
      id: user.id,
      displayName: user.displayName,
      userPrincipalName: user.userPrincipalName,
      assignedLicenses: user.assignedLicenses || [],
    }));

    return NextResponse.json(users);
  } catch (error: any) {
    console.error('Error in /api/microsoft-graph/users:', error);
    return NextResponse.json({error: error.message}, {status: 500});
  }
}
