import { CaptionItem } from '../types.js';
import { SessionInstance } from './instance.js';
import { Redis } from '@upstash/redis/node';
import { supabase } from './supabase.js';

interface Geo {
  city?: string;
  country?: string;
  flag?: string;
  region?: string;
  countryRegion?: string;
  latitude?: string;
  longitude?: string;
  postalCode?: string;
}

interface AnalyticsEvent {
  u: string;
  l: string;
  e: string;
  g?: Geo;
}

async function processAnalytics(kv: Redis, key: string) {
  try {
    const analytics: Record<string, unknown> = await kv.xrange(key, '-', '+');

    if (!analytics) {
      return [];
    }

    const output = Object.entries(analytics).map(([id, event]) => {
      const timestamp = parseInt(id.split('-')[0]);
      const { u, l, e, g } = event as AnalyticsEvent;

      return {
        u: u,
        t: timestamp,
        l,
        e,
        g,
      };
    });

    await kv.del(key).catch((err) => {
      console.error('Failed to delete analytics key', key, err);
    });

    return output;
  } catch (e) {
    console.error('Failed to process analytics', e);
    return [];
  }
}

export async function initSessionRecord(
  this: SessionInstance,
  first: CaptionItem
) {
  if (!this.options) {
    return;
  }

  supabase.from('sessions').insert({
    id: this.sessionId,
    account_id: this.options.accountId,
    duration: Math.ceil(first.duration),
    language: this.options.language,
    translations: this.options.translations,
    data: [],
    analytics: [],
    started_at: new Date(),
  });
  // .then((res) => {
  //   console.log('Session inserted', res);
  // });
}

export async function trackSessionDuration(this: SessionInstance) {
  if (!this.captions.default.length || !this.options) {
    return;
  }

  const last = this.captions.default.slice(-1)[0];
  const duration = last.start + last.duration;

  // This may not work correctly with session start times resetting
  // Consider using timestamp instead of start time

  // Check duration when dealing with paused/muted captions
  supabase
    .from('sessions')
    .update({
      duration,
    })
    .eq('id', this.sessionId);
  // .then((res) => {
  //   console.log('Session updated', res);
  // });

  // const totalDuration = this.captions.reduce((acc, caption) => {
  //   const start = caption.start || 0;
  //   const duration = caption.duration || 0;
  //   return acc + (start + duration);
  // }, 0);
}

export async function saveCaptionsToDatabase(this: SessionInstance) {
  if (!this.captions.default.length || !this.options) {
    console.log('No captions to save', this.options?.accountId);
    return;
  }

  const { accountId, language, translations } = this.options;

  const last = this.captions.default.slice(-1)[0];
  const started_at = new Date(this.captions.default[0].t);
  const duration = Math.ceil(last.start + last.duration);

  const analyticsKey = `analytics_${accountId}_${this.sessionId}`;

  const kv = new Redis({
    url: process.env.VERCEL_KV_URL,
    token: process.env.VERCEL_KV_TOKEN,
  });

  const analytics = await processAnalytics(kv, analyticsKey);

  // Write all the translations to the session as well

  await supabase
    .from('sessions')
    .upsert({
      id: this.sessionId,
      account_id: accountId,
      duration,
      language: language,
      translations: translations,
      data: this.captions.default,
      analytics: analytics,
      started_at,
    })
    .eq('id', this.sessionId)
    .then((res) => {
      this.log('Session complete');
    });

  if (!translations?.length) {
    return;
  }

  const payload = this.options.translations
    .map((translation) => {
      const data = this.captions[translation];

      if (!data || !data.length) {
        return null;
      }

      return {
        session_id: this.sessionId,
        account_id: accountId,
        language: translation,
        data,
      };
    })
    .filter(Boolean);

  if (!payload.length) {
    // console.log('No translations to save', this.options.accountId);
    return;
  }

  // Write all the translations to the session as well
  await supabase
    .from('translations')
    .insert(payload)
    .then(() => {
      this.log('Translations saved');
    });

  // save captions to db
  // Need to have a big reconciliation one at the end
  // Also need to have one that just bumps the duration
}
