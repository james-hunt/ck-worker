import { SessionInstance } from '../instance.js';
import { CaptionItem } from '../../types.js';

import {
  ErrorType,
  RealtimeClient,
  SocketStateChangeEvent,
  type AddPartialTranscript,
  type AddTranscript,
} from '@speechmatics/real-time-client';

import { SpeechToText, SpeechToTextStatus } from './lib.js';
import { createSpeechmaticsJWT } from '@speechmatics/auth';

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

  // const realtime = client.streaming.transcriber({
  //   sampleRate: 16000,
  //   formatTurns: true,
  //   encoding: 'pcm_s16le',
  //   endOfTurnConfidenceThreshold: 0.3,
  //   minEndOfTurnSilenceWhenConfident: 0,
  //   maxTurnSilence: 800,
  //   filterProfanity: true,
  //   keyterms: this.options.keywords?.length ? this.options.keywords : [],
  // });

  const onTurn = (data: AddPartialTranscript | AddTranscript) => {
    const turn = data.results[0];

    console.log('Speechmatics turn data:', turn);

    const words = turn.alternatives || [];

    const start = turn.start_time || 0;
    const end = turn.end_time || start;
    const duration = end - start || 0;
    const isComplete = !!turn.is_eos;

    const nextCaption: CaptionItem = {
      start: formatTime(start),
      duration: formatTime(duration),
      text: words.map((w) => w.content).join(' '),
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
    console.log('Speechmatics message data:', data);
    switch (data.message) {
      // case 'AddTranscript':
      // case 'AddPartialTranscript':
      //   return onTurn(data as AddPartialTranscript | AddTranscript);
      case 'Error':
        onError(data as ErrorType);
        this.log('Speechmatics error message:', data);
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

  console.log('Starting Speechmatics realtime with JWT:', jwt);

  await realtime.start(jwt, {
    audio_format: {
      type: 'raw',
      encoding: 'pcm_s16le',
      sample_rate: 16000,
    },
    transcription_config: {
      language: 'en',
      enable_partials: true,
      max_delay: 0.8,
      additional_vocab: this.options.keywords?.length
        ? this.options.keywords?.map((k) => ({ content: k }))
        : undefined,
    },
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
