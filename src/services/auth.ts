import { jwtVerify, decodeJwt, type JWTPayload, JWTVerifyResult } from 'jose';
import { supabase } from './supabase.js';

export interface AuthData extends JWTPayload {
  token?: string;
  user_metadata: {
    avatar_url?: string;
    email: string;
    email_verified: boolean;
    first_name: string;
    full_name: string;
    iss: string;
    last_name: string;
    name: string;
    phone_verified: boolean;
    picture?: string;
    provider_id: string;
    sub: string;
  };
}

type AuthResult = JWTVerifyResult<AuthData>['payload'];

export async function validateToken(
  secret: string,
  tokenList?: string | null
): Promise<AuthResult | undefined> {
  try {
    if (!tokenList) {
      throw new Error('Token not provided');
    }

    const token = tokenList.split(',').pop()?.trim();

    if (!token) {
      throw new Error('Token not provided');
    }

    if (!token.startsWith('ey')) {
      throw new Error('Invalid token');
    }

    if (token.length < 100) {
      throw new Error('Invalid token');
    }

    if (token.split('.').length !== 3) {
      throw new Error('Invalid token');
    }

    const jwt = decodeJwt(token);

    if (!jwt.exp || jwt.exp < Date.now() / 1000) {
      throw new Error('Token expired');
    }

    const decoded = await jwtVerify<AuthData>(
      token,
      new TextEncoder().encode(secret)
    );

    if (!decoded.payload) {
      throw new Error('Invalid token');
    }

    return decoded.payload;
  } catch (e) {
    console.error('Error validating token', (e as Error).message);
    return undefined;
  }
}

export async function confirmAccountId(auth: AuthResult, account_id: string) {
  return fetch(`https://api.captionkit.io/v2/session/validate`, {
    method: 'POST',
    body: JSON.stringify({ account_id }),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.token}`,
    },
  })
    .then((res) => {
      console.log('Account ID confirmation response', res.status);
      return res.json();
    })
    .catch((e) => {
      console.error('Error confirming account ID', (e as Error).message);
      return null;
    });
}

const earliestDate = '2024-11-13 12:00:00.000+00';

export async function confirmAccountAccess(
  auth: AuthResult,
  account_id: string
) {
  const [accountUser, subscription] = await Promise.all([
    supabase
      .schema('basejump')
      .from('account_user')
      .select('account_role')
      .eq('user_id', auth.sub)
      .eq('account_id', account_id)
      .single(),
    supabase
      .from('subscriptions')
      .select('hours,current_period_start,is_active')
      .eq('account_id', account_id)
      .single(),
  ]);

  const { hours, current_period_start } = subscription.data?.is_active
    ? subscription.data
    : { hours: 4, current_period_start: earliestDate };

  const role = accountUser.data?.account_role;

  if (!role) {
    throw 403;
  }

  const usage = await supabase
    .from('sessions')
    .select('duration.sum()')
    .eq('account_id', account_id)
    .gte('started_at', current_period_start)
    .single();

  const captionSecondsUsed = usage.data?.sum || 0;
  const planSeconds = hours * 60 * 60;
  const captionsSecondsRemaining = captionSecondsUsed < planSeconds;

  if (!captionsSecondsRemaining) {
    throw 429;
  }

  return {
    success: true,
    account_id,
    seconds_remaining: planSeconds - captionSecondsUsed,
  };
}
