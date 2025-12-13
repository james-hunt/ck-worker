import { InputLanguage, CaptionItem } from '../../types.js';
import { SessionInstance } from '../instance.js';
import { WebSocket } from 'ws';
import { wsIsOpen } from '../../lib.js';

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

type BooleanString = 'true' | 'false';
interface DeepgramConfig {
  model: string;
  language: InputLanguage;
  punctuate: BooleanString;
  profanity_filter: BooleanString;
  channels: number;
  sample_rate: number;
  smart_format: BooleanString;
  interim_results: BooleanString;
  vad_events: BooleanString;
  endpointing: number;
  encoding: 'linear16' | 'mulaw' | 'flac' | 'ogg_opus';
}

const DEEPGRAM_KEEP_ALIVE = 3000;

export async function registerDeepgramConnection(this: SessionInstance) {
  if (wsIsOpen(this.externalWs)) {
    console.log('External connection already established for this instance.');
    return;
  }

  this.log('Connect to Deepgram');

  try {
    const config: DeepgramConfig = {
      model: 'nova-2-general',
      language: this.options.language,
      punctuate: 'true',
      profanity_filter: this.options.profanityFilter ? 'true' : 'false',
      channels: 1,
      encoding: 'linear16',
      sample_rate: 16000,
      smart_format: 'true',
      interim_results: this.options.interimResults ? 'true' : 'false',
      vad_events: 'false',
      endpointing: 100,
    };

    // @ts-expect-error
    const params = new URLSearchParams(config);

    this.externalWs = new WebSocket(
      `wss://api.deepgram.com/v1/listen?${params.toString()}`,
      ['token', process.env.DEEPGRAM_API_KEY!]
    );

    const interval = setInterval(() => {
      if (wsIsOpen(this.externalWs)) {
        const keepAliveMsg = JSON.stringify({ type: 'KeepAlive' });
        this.externalWs?.send(keepAliveMsg);
      }
    }, DEEPGRAM_KEEP_ALIVE);

    this.externalWs.addEventListener('open', () => {
      // this.didConnect = true;
    });

    this.externalWs.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') {
        console.warn('Received non-string message from 3rd party:', event.data);
        return;
      }

      const caption = formatResponse.call(this, event.data);
      if (!caption) {
        return;
      }

      this.processCaptions(caption).catch((error) => {
        this.log('Error processing Deepgram captions:', error);
      });
    });

    this.externalWs.addEventListener('close', (event) => {
      this.log('Deepgram WebSocket closed:', event.code, event.reason);
      interval && clearInterval(interval);

      if (!this.closing) {
        this.cleanupConnections(
          `External connection closed: ${event.code} ${event.reason}`
        );
      }
    });

    this.externalWs.addEventListener('error', (error) => {
      this.log('Deepgram party WebSocket error:', error);
      if (!this.closing) {
        this.cleanupConnections('External connection error');
      }
    });
  } catch (error) {
    this.log('Failed to establish connection to 3rd party:', error);
    this.cleanupConnections('Failed to init external connection');
  }

  // Wait for the connection to be established to ensure DG gets headers on first chunk
  return new Promise((resolve, reject) => {
    if (!this.externalWs) {
      return reject();
    }

    if (this.externalWs?.readyState === WebSocket.OPEN) {
      resolve(true);
    }

    this.externalWs.addEventListener('open', resolve);
    this.externalWs.addEventListener('error', reject);
  });
}

function formatResponse(
  this: SessionInstance,
  message: string
): CaptionItem | void {
  try {
    const data = JSON.parse(message) as DeepgramResponse;
    const alternatives = data?.channel?.alternatives;

    if (!alternatives || alternatives.length === 0 || data.type !== 'Results') {
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

    return nextCaption;
  } catch (e) {
    console.error('Error parsing response data:', e);
  }
}
