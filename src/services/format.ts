import { SessionInstance } from './instance.js';
import { CaptionItem } from '../types.js';

export const profanity = [
  'fuck',
  'fucking',
  'fucker',
  'fucked',
  'shit',
  'shitting',
  'shitter',
  'cunt',
  'bitch',
];

export function replaceProfanity(text: string, list = profanity) {
  const output = list.reduce((out, k) => {
    const regex = new RegExp(String.raw`\b${k}\b`, 'gi');
    return out.replace(regex, '').replace(/\s+/g, ' ');
  }, text);

  return output.replace(/\s{2,}/g, ' ').trim();
}

export function formatCaptions(
  this: SessionInstance,
  data: CaptionItem
): CaptionItem | null {
  if (!this.options) {
    return null;
  }

  const { language, profanityFilter, blocked } = this.options;

  const isEnglish = language?.split('-')[0] === 'en';
  const text =
    isEnglish && profanityFilter ? replaceProfanity(data.text) : data.text;

  const replacedText = blocked.length ? replaceProfanity(text, blocked) : text;

  if (!replacedText) {
    return null;
  }

  const nextCaption: CaptionItem = {
    ...data,
    text: replacedText,
    t: Date.now(),
  };

  const index = this.captions.default.findIndex(
    (c) => c.start === nextCaption.start
  );

  if (index === -1) {
    this.captions.default.push(nextCaption);
  } else {
    this.captions.default[index] = nextCaption;
  }

  return nextCaption;
}
