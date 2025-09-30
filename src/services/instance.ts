import { wsIsOpen } from '../lib.js';
import { CaptionItem, type CaptionOptions, type Captions } from '../types.js';
import { registerAssemblyConnection } from './assemblyAi.js';
import { registerBrowserClient } from './browser.js';
import { closeConnections } from './connection.js';
import { initSessionRecord, trackSessionDuration } from './db.js';
import { registerDeepgramConnection } from './deepgram.js';
import { formatCaptions } from './format.js';
import { publishMessage } from './supabase.js';
import { processTranslations } from './translation.js';
import { WebSocket } from 'ws';

// Need to keep current webhooks in a map somwhere?

export class SessionInstance {
  createdAt: number = Date.now();
  clientWs: WebSocket | null; // WebSocket connection to the browser
  externalWs: WebSocket | null = null; // WebSocket connection to the 3rd party service
  sessionId: string; // Unique session ID for the connection
  accountId: string; // Unique account ID for the connection
  options: CaptionOptions; // Options for captions
  closing: boolean = false; // Flag to indicate if the connection is closing
  onCleanup: () => void; // Callback to run on cleanup
  lastCaptionAt: number = 0; // Timestamp of the last caption received
  captions: Captions = {
    default: [],
  };

  constructor(
    // clientWs: WebSocket,
    accountId: string,
    sessionId: string,
    options: CaptionOptions,
    onCleanup: () => void
  ) {
    // this.clientWs = clientWs;
    this.sessionId = sessionId;
    this.accountId = accountId;
    this.options = options;
    this.onCleanup = onCleanup;
  }

  async init() {
    if (this.options?.language.startsWith('en')) {
      await registerAssemblyConnection.call(this);
    } else {
      await registerDeepgramConnection.call(this);
    }
  }

  connectClient(ws: WebSocket) {
    if (this.clientWs) {
      console.log('Client already connected, cannot reconnect');
      return;
    }

    this.clientWs = ws;
    registerBrowserClient.call(this);
  }

  async processCaptions(caption: CaptionItem) {
    if (!caption) {
      return;
    }

    // Apply profanity filter and queue captions
    const nextCaption = formatCaptions.call(this, caption);

    if (!nextCaption) {
      return null;
    }

    this.sendMessageToClient(JSON.stringify(nextCaption));
    this.lastCaptionAt = Date.now();

    // Push to supabase channel
    publishMessage.call(this);

    // AssemblyAI sends way more events and also sends 2 "complete" events, when formatting is turned on.
    // We only count complete once captions run formatting step as well.
    if (!nextCaption.isComplete) {
      return;
    }

    // Create or update DB row
    if (nextCaption.start === 0 || !this.captions.default.length) {
      initSessionRecord.call(this, nextCaption);
    } else {
      trackSessionDuration.call(this);
    }

    // Run translations
    await processTranslations.call(this).catch((e) => {
      console.error('Failed to process translations', e);
    });
  }

  sendMessageToClient(message: string) {
    if (!message?.length) {
      return;
    }

    if (this.clientWs?.readyState === WebSocket.OPEN) {
      // console.log('Send to client', message);
      this.clientWs.send(message);
    }
  }

  sendMessageForTranscription(message: Buffer) {
    if (!message?.byteLength) {
      return;
    }

    if (this.externalWs?.readyState === WebSocket.OPEN) {
      // this.lastMessage = Date.now();
      this.externalWs.send(message);
    } else {
      console.log('Send without being open first');
    }
  }

  log(...args: any[]) {
    console.log(`${this.accountId}|${this.sessionId}`, ...args);
  }

  terminate() {
    this.closing = true;
    this.clientWs?.terminate();
    this.externalWs?.terminate();
  }

  cleanupConnections(reason: string) {
    return closeConnections.call(this, reason);
  }
}
