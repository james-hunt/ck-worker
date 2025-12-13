import { SessionInstance } from '../instance.js';
import { CaptionItem } from '../../types.js';

import { AssemblyAI, TurnEvent } from 'assemblyai';

import { SpeechToText, SpeechToTextStatus } from './lib.js';

const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY!,
});

// ms to seconds with 2 decimal places
function formatTime(ms: number): number {
  return parseFloat((ms / 1000).toFixed(2));
}

export async function registerAssemblyConnection(
  this: SessionInstance
): Promise<SpeechToText> {
  // Check if already connected
  if (this.speechToText?.getStatus() === SpeechToTextStatus.CONNECTED) {
    this.log('AssemblyAI connection already exists');
    return this.speechToText;
  }

  let status: SpeechToTextStatus = SpeechToTextStatus.CONNECTING;

  const realtime = client.streaming.transcriber({
    sampleRate: 16000,
    formatTurns: true,
    encoding: 'pcm_s16le',
    endOfTurnConfidenceThreshold: 0.2,
    minEndOfTurnSilenceWhenConfident: 50,
    maxTurnSilence: 800,
    filterProfanity: true,
    keytermsPrompt: this.options.keywords?.length ? this.options.keywords : [],
  });

  realtime.on('turn', (data: TurnEvent) => {
    try {
      const start = data.words[0].start || 0;
      const end = data.words[data.words.length - 1].end || start;
      const duration = end - start || 0;
      const isComplete = data.end_of_turn && data.turn_is_formatted;

      const nextCaption: CaptionItem = {
        start: formatTime(start),
        duration: formatTime(duration),
        text: data.transcript,
        t: Date.now(),
        requestId: this.sessionId,
        isComplete,
      };

      this.processCaptions(nextCaption).catch((error) => {
        this.log('Error processing AssemblyAI captions:', error);
      });
    } catch (e) {
      console.error('Error parsing response data:', e);
      return;
    }
  });

  realtime.on('close', (code: number, reason: string) => {
    status = SpeechToTextStatus.CLOSED;
    if (code !== 1000) {
      this.log('AssemblyAI close error:', code, reason);
    }

    if (!this.closing) {
      this.log('AssemblyAI closed unexpectedly, not during cleanup.');

      // Fire close cleanup
      this.cleanupConnections(`AssemblyAI closed: ${code} ${reason}`);
    }
  });

  realtime.on('error', (error: Error) => {
    status = SpeechToTextStatus.ERROR;
    // Hard Stop or reconnect?
    this.log('AssemblyAI error:', error);
    if (!this.closing) {
      this.cleanupConnections(`AssemblyAI error: ${error.message}`);
    }
  });

  this.log('Connect to AssemblyAI');
  await realtime.connect();

  return {
    close: async () => {
      await realtime.close();
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
