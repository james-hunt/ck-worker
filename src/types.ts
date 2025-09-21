import type { InputLanguage, OutputLanguage } from './languages.js';
export type {InputLanguage, OutputLanguage};

export interface CaptionOptions {
  language: InputLanguage;
  translations: OutputLanguage[];
  accountId: string;
  keywords: string[];
  blocked: string[];
  interimResults: boolean;
  profanityFilter: boolean;
}

export interface TranscriptionItem {
  start: number;
  duration: number;
  text: string;
  t: number;
  words?: TranscriptionItem[];
}

export interface CaptionItem extends TranscriptionItem {
  isComplete: boolean;
  requestId?: string;
}

export interface CaptionRecord {
  data: CaptionItem[];
}

export interface Captions
  extends Partial<Record<OutputLanguage, CaptionItem[]>> {
  default: CaptionItem[];
}
