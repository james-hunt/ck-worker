import { Redis } from '@upstash/redis';
import { Realtime, InferRealtimeEvents } from '@upstash/realtime';
import { z } from 'zod/v4';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const transcriptionSchema = z.object({
  start: z.number(),
  duration: z.number(),
  text: z.string(),
  t: z.number(),
  isComplete: z.boolean(),
  requestId: z.string().optional(),
});

const settingsSchema = z.object();

const schema = {
  transcription: {
    partial: transcriptionSchema,
    final: transcriptionSchema,
  },
  settings: settingsSchema,
};

export const TranscriptionItemSchema: z.ZodType<{
  start: number;
  duration: number;
  text: string;
  t: number;
  words?: any[];
}> = z.lazy(() =>
  z.object({
    start: z.number(),
    duration: z.number(),
    text: z.string(),
    t: z.number(),
  })
);

export const realtime = new Realtime({ schema, redis });
export type RealtimeEvents = InferRealtimeEvents<typeof realtime>;
