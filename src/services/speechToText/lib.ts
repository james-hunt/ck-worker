import { InputLanguage } from '../../languages.js';
import { registerAssemblyConnection } from './assemblyAi.js';
import { registerSpeechmaticsConnection } from './speechmatics.js';

export enum SpeechToTextStatus {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
  CLOSED = 'closed',
}

export interface SpeechToText {
  close: () => Promise<void>;
  getStatus: () => SpeechToTextStatus;
  sendSpeech: (chunk: Buffer) => Promise<void>;
}
