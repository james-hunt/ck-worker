import { SessionInstance } from '../../instance.js';
import { CaptionItem } from '../../../types.js';

import {
  ErrorType,
  RealtimeClient,
  SocketStateChangeEvent,
  type AddPartialTranscript,
  type AddTranscript,
} from '@speechmatics/real-time-client';

import { SpeechToText, SpeechToTextStatus } from './../lib.js';
import { createSpeechmaticsJWT } from '@speechmatics/auth';
import { getLanguageCode, SpeechmaticsSentenceStream } from './lib.js';

// ms to seconds with 2 decimal places
function formatTime(ms: number): number {
  return parseFloat((ms / 1000).toFixed(2));
}

export async function registerSpeechmaticsConnection(
  this: SessionInstance
): Promise<SpeechToText> {
  // Check if already connected
  if (this.speechToText?.getStatus() === SpeechToTextStatus.CONNECTED) {
    this.log('Speechmatics connection already exists');
    return this.speechToText;
  }

  let status: SpeechToTextStatus = SpeechToTextStatus.CONNECTING;

  const realtime = new RealtimeClient({
    url: 'wss://us.rt.speechmatics.com/v2',
  });

  const stream = new SpeechmaticsSentenceStream((event) => {
    this.processCaptions(event).catch((error) => {
      this.log('Error processing Speechmatics captions:', error);
    });
  });

  const onTurn = (data: AddPartialTranscript | AddTranscript) => {
    const { metadata } = data;

    const start = metadata.start_time || 0;
    const end = metadata.end_time || start;
    const duration = end - start || 0;
    const isComplete = data.message === 'AddTranscript';

    const nextCaption: CaptionItem = {
      start,
      duration: formatTime(duration),
      text: metadata.transcript || '',
      t: Date.now(),
      requestId: this.sessionId,
      isComplete,
    };

    this.processCaptions(nextCaption).catch((error) => {
      this.log('Error processing AssemblyAI captions:', error);
    });
  };

  const onError = (error: ErrorType) => {
    status = SpeechToTextStatus.ERROR;
    // Hard Stop or reconnect?
    this.log('Speechmatics error:', error);
    if (!this.closing) {
      this.cleanupConnections(`Speechmatics error: ${error.message}`);
    }
  };

  const onClose = () => {
    status = SpeechToTextStatus.CLOSED;
    if (!this.closing) {
      this.log('Speechmatics closed unexpectedly, not during cleanup.');

      // Fire close cleanup
      this.cleanupConnections(`Speechmatics closed`);
    }
  };

  realtime.addEventListener('receiveMessage', ({ data }) => {
    // console.log('Speechmatics message data:', data);
    switch (data.message) {
      case 'Error':
        onError(data as ErrorType);
        this.log('Speechmatics error message:', data);
        return;
      default:
        stream.onMessage(data);
        return;
    }
  });

  realtime.addEventListener(
    'socketStateChange',
    (event: SocketStateChangeEvent) => {
      if (event.socketState === 'closed') {
        onClose();
        status = SpeechToTextStatus.CONNECTED;
      }
    }
  );

  this.log('Connect to Speechmatics');

  const jwt = await createSpeechmaticsJWT({
    type: 'rt',
    region: 'usa',
    apiKey: process.env.SPEECHMATICS_API_KEY!,
    ttl: 60 * 60 * 4, // seconds
  });

  await realtime
    .start(jwt, {
      audio_format: {
        type: 'raw',
        encoding: 'pcm_s16le',
        sample_rate: 16000,
      },
      transcription_config: {
        language: getLanguageCode(this.options.language),
        operating_point: 'standard',
        // enable_partials: true,
        // max_delay_mode: 'flexible',
        enable_entities: true,
        max_delay: 1,
        // conversation_config: {
        //   end_of_utterance_silence_trigger: 1.2,
        // },
        transcript_filtering_config: {
          remove_disfluencies: true,
        },
        additional_vocab: this.options.keywords?.length
          ? this.options.keywords?.map((k) => ({ content: k }))
          : undefined,
      },
    })
    .catch((error) => {
      this.log('Error connecting to Speechmatics:', error);
      throw error;
    });

  return {
    close: async () => {
      await realtime.stopRecognition();
    },
    getStatus: () => status,
    sendSpeech: async (chunk: Buffer) => {
      const buf = chunk.buffer.slice(
        chunk.byteOffset,
        chunk.byteOffset + chunk.byteLength
      );

      realtime.sendAudio(buf);
    },
  };
}
