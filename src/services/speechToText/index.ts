import { InputLanguage } from '../../languages.js';
import { SessionInstance } from '../instance.js';
import { registerAssemblyConnection } from './assemblyAi.js';
import { registerDeepgramConnection } from './deepgram.js';
import { registerSpeechmaticsConnection } from './speechmatics/index.js';

export { SpeechToText } from './lib.js';

const clients = {
  assemblyAi: registerAssemblyConnection,
  speechmatics: registerSpeechmaticsConnection,
  deepgram: registerDeepgramConnection,
};

type ClientKey = keyof typeof clients;

export const providerLanguageMap: Record<InputLanguage, ClientKey> = {
  ar: 'speechmatics',
  ba: 'speechmatics',
  eu: 'speechmatics',
  be: 'speechmatics',
  bn: 'speechmatics',
  bg: 'deepgram',
  // 'yue': 'speechmatics',
  ca: 'deepgram',
  zh: 'deepgram',
  // 'zh-CN': 'speechmatics',
  // 'zh-Hans': 'speechmatics',
  'zh-TW': 'deepgram',
  // 'zh-Hant': 'speechmatics',
  'zh-HK': 'deepgram',
  hr: 'speechmatics',
  cs: 'deepgram',
  da: 'deepgram',
  nl: 'deepgram',
  en: 'assemblyAi',
  'en-US': 'assemblyAi',
  'en-AU': 'assemblyAi',
  'en-GB': 'assemblyAi',
  'en-NZ': 'assemblyAi',
  eo: 'speechmatics',
  et: 'deepgram',
  fi: 'deepgram',
  fr: 'deepgram',
  'fr-CA': 'deepgram',
  gl: 'speechmatics',
  de: 'deepgram',
  'de-CH': 'deepgram',
  el: 'deepgram',
  he: 'speechmatics',
  hi: 'deepgram',
  hu: 'deepgram',
  id: 'deepgram',
  // 'ia': 'speechmatics',
  ga: 'speechmatics',
  it: 'deepgram',
  ja: 'deepgram',
  ko: 'deepgram',
  lv: 'deepgram',
  lt: 'deepgram',
  ms: 'deepgram',
  // 'en_ms': 'speechmatics',
  mt: 'speechmatics',
  // 'cmn': 'speechmatics',
  // 'cmn_en': 'speechmatics',
  // 'cmn_en_ms_ta': 'speechmatics',
  mr: 'speechmatics',
  mn: 'speechmatics',
  no: 'deepgram',
  fa: 'speechmatics',
  pl: 'deepgram',
  pt: 'deepgram',
  'pt-BR': 'deepgram',
  ro: 'deepgram',
  ru: 'deepgram',
  sk: 'deepgram',
  sl: 'deepgram',
  es: 'deepgram',
  'es-419': 'deepgram',
  multi: 'deepgram',
  sw: 'speechmatics',
  sv: 'deepgram',
  tl: 'speechmatics',
  ta: 'speechmatics',
  // 'en_ta': 'speechmatics',
  th: 'speechmatics',
  tr: 'deepgram',
  uk: 'deepgram',
  ur: 'speechmatics',
  ug: 'speechmatics',
  vi: 'deepgram',
  cy: 'speechmatics',
};

export async function getClient(this: SessionInstance) {
  const clientKey = providerLanguageMap[this.options.language];
  const client = clients[clientKey];
  return client.call(this);
}
