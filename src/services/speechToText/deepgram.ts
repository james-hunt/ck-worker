import { CaptionItem } from '../../types.js';
import { SessionInstance } from '../instance.js';
import { SpeechToTextStatus } from './lib.js';

import {
  createClient,
  LiveTranscriptionEvents,
  DeepgramError,
} from '@deepgram/sdk';

interface DeepgramWords {
  word: string;
  start: number;
  end: number;
  confidence: number;
  // punctuated_word: string | null;
}

interface DeepgramAlternative {
  transcript: string;
  confidence: number;
  words: DeepgramWords[];
}

export interface DeepgramResponse {
  type: 'Results';
  channel_index: [number, number];
  duration: number;
  start: number;
  is_final: boolean;
  speech_final: boolean;
  channel: {
    alternatives: DeepgramAlternative[];
  };
  metadata: {
    request_id: string;
    model_info: {
      name: string;
      version: string;
      arch: string;
    };
    model_uuid: string;
  };
  from_finalize: boolean;
}

const DEEPGRAM_KEEP_ALIVE = 3000;

const client = createClient(process.env.DEEPGRAM_API_KEY!);

export async function registerDeepgramConnection(this: SessionInstance) {
  if (this.speechToText?.getStatus() === SpeechToTextStatus.CONNECTED) {
    this.log('Deepgram connection already exists');
    return this.speechToText;
  }

  let status: SpeechToTextStatus = SpeechToTextStatus.CONNECTING;
  let lastMessage = Date.now();

  const interval = setInterval(() => {
    if (Date.now() - lastMessage > DEEPGRAM_KEEP_ALIVE) {
      this.log('Sending Deepgram keep-alive ping');
      realtime.keepAlive();
      lastMessage = Date.now();
    }
  }, DEEPGRAM_KEEP_ALIVE);

  const realtime = client.listen.live({
    model: 'nova-2-general',
    language: this.options?.language || 'en',
    punctuate: true,
    profanity_filter: this.options?.profanityFilter ? true : false,
    channels: 1,
    encoding: 'linear16',
    sample_rate: 16000,
    smart_format: true,
    interim_results: !!this.options.interimResults,
    vad_events: false,
    endpointing: 300,
  });

  const onTurn = (data: DeepgramResponse) => {
    try {
      const alternatives = data?.channel?.alternatives;

      if (
        !alternatives ||
        alternatives.length === 0 ||
        data.type !== 'Results'
      ) {
        return;
      }

      const text = alternatives.map((a) => a.transcript).join(' ');

      const start = parseFloat(data.start.toFixed(2));
      const duration = parseFloat(data.duration.toFixed(2));

      const nextCaption: CaptionItem = {
        start,
        duration,
        text,
        t: Date.now(),
        requestId: this.sessionId,
        isComplete: data.is_final,
      };

      this.processCaptions(nextCaption).catch((error) => {
        this.log('Error processing Deepgram captions:', error);
      });
    } catch (e) {
      console.error('Error parsing Deepgram response:', e);
    }
  };

  const onError = (error: DeepgramError) => {
    status = SpeechToTextStatus.ERROR;
    clearInterval(interval);
    // Hard Stop or reconnect?
    this.log('Deepgram error:', error);
    if (!this.closing) {
      this.cleanupConnections(`Deepgram error: ${error.message}`);
    }
  };

  const onClose = () => {
    status = SpeechToTextStatus.CLOSED;
    clearInterval(interval);
    if (!this.closing) {
      this.log('Deepgram closed unexpectedly, not during cleanup.');

      // Fire close cleanup
      this.cleanupConnections(`Deepgram closed`);
    }
  };

  await new Promise((resolve, reject) => {
    if (realtime.isConnected()) {
      resolve(true);
    }

    realtime.on(LiveTranscriptionEvents.Open, resolve);
    realtime.on(LiveTranscriptionEvents.Error, reject);
  });

  status = SpeechToTextStatus.CONNECTED;

  realtime.on(LiveTranscriptionEvents.Close, onClose);
  realtime.on(LiveTranscriptionEvents.Error, onError);
  realtime.on(LiveTranscriptionEvents.Transcript, onTurn);

  return {
    close: async () => {
      clearInterval(interval);
      realtime.disconnect();
    },
    getStatus: () => status,
    sendSpeech: async (chunk: Buffer) => {
      const buf = chunk.buffer.slice(
        chunk.byteOffset,
        chunk.byteOffset + chunk.byteLength
      );

      realtime.send(buf);
    },
  };
}
