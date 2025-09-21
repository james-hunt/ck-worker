import { SessionInstance } from './instance.js';
import { CaptionItem } from '../types.js';
import { wsIsOpen } from '../lib.js';
import { WebSocket } from 'ws';

interface AssemblyWord {
  start: number;
  end: number;
  text: string;
  confidence: number;
  word_is_final: true;
}
interface AssemblyAiResponse {
  turn_order: number;
  turn_is_formatted: boolean;
  end_of_turn: boolean;
  transcript: string;
  end_of_turn_confidence: number;
  words: AssemblyWord[];
  type: 'Turn';
}

export async function registerAssemblyConnection(
  this: SessionInstance,
  attempt: number = 0
): Promise<void> {
  // Externally checks if connection is already established
  if (!!wsIsOpen(this.externalWs)) {
    console.warn('External WebSocket already open, skipping connection setup.');
    return;
  }

  try {
    const params = new URLSearchParams({
      sample_rate: '16000',
      format_turns: 'true',
      encoding: 'pcm_s16le',
      end_of_turn_confidence_threshold: '0.3',
      min_end_of_turn_silence_when_confident: '0',
      max_turn_silence: '800',
      token: process.env.ASSEMBLYAI_API_KEY!,
    });

    const ws = new WebSocket(
      `wss://streaming.assemblyai.com/v3/ws?${params.toString()}`
    );

    await new Promise<void>((resolve, reject) => {
      if (ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      ws.addEventListener('open', () => {
        resolve();
      });

      ws.addEventListener('error', (error) => {
        reject(error);
      });
    });

    ws.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') {
        console.warn('Received non-string message from 3rd party:', event.data);
        return;
      }

      if (wsIsOpen(this.clientWs)) {
        console.warn(
          'Client WS not open, cannot forward message from 3rd party.'
        );
        // Allow for reconnection
        // this.cleanupConnections('Client WS not open');
        // return;
      }

      const caption = formatResponse.call(this, event.data);
      if (!caption) {
        return;
      }

      this.processCaptions(caption).catch((error) => {
        console.log('Error processing AssemblyAI captions:', error);
      });
    });

    ws.addEventListener('close', (event) => {
      console.log('AssemblyAI closed:', event.code, event.reason);

      if (!this.closing) {
        this.cleanupConnections(
          `AssemblyAI closed: ${event.code} ${event.reason}`
        );
      }
    });

    ws.addEventListener('error', (error) => {
      // Hard Stop or reconnect?
      console.error('AssemblyAI error:', error);
      if (!this.closing) {
        this.cleanupConnections('AssemblyAI error');
      }
    });

    this.externalWs = ws;
    return;
  } catch (error) {
    console.error('Failed to establish connection to 3rd party:', error);

    // Hard Stop
  }
}

// ms to seconds with 2 decimal places
function formatTime(ms: number): number {
  return parseFloat((ms / 1000).toFixed(2));
}

function formatResponse(
  this: SessionInstance,
  message: string
): CaptionItem | void {
  try {
    const data = JSON.parse(message) as AssemblyAiResponse;

    if (data.type !== 'Turn' || !data.transcript || !data.words.length) {
      return;
    }

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

    return nextCaption;
  } catch (e) {
    console.error('Error parsing response data:', e);
  }
}
