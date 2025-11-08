import { ModelMessage, generateText } from 'ai';
import { SessionInstance } from './instance.js';
import { inputLanguages, outputLanguages } from '../languages.js';
import {
  CaptionItem,
  type InputLanguage,
  type OutputLanguage,
} from '../types.js';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { supabase } from './supabase.js';
import { getSessionKey } from '../lib.js';

const getSystemPrompt = (input: InputLanguage, output: OutputLanguage) => {
  const inputLabel = inputLanguages[input];
  const outputLabel = outputLanguages[output];
  return `You are a specialized church translator for a realtime that translates the prompt from ${inputLabel}(${input}) to ${outputLabel}(${output}). Return ONLY the translated text in ${outputLabel} for the last user message. DO NOT anything other than the translated text, include alternatives, explanation or thinking. Prioritise meaning and tone over literal translation. Ensure that the translation is appropriate for a church context, such as "spirit" usually referring to Holy Spirit.`;
};

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

export async function processSingleTranslation(
  this: SessionInstance,
  captions: CaptionItem[],
  input: InputLanguage,
  output: OutputLanguage
) {
  const system = getSystemPrompt(input, output);
  const inputCaptions = captions.slice(-4, -1);
  const lastCaption = captions.slice(-1).pop();
  const outputCaptions = (this.captions[output] || []).slice(-6);

  // This shouldn't happen
  if (!lastCaption) {
    return;
  }

  const messages: ModelMessage[] = [{ role: 'system', content: system }];

  // Return previous messages with matches for context
  for (const caption of inputCaptions) {
    const matchingOutput = outputCaptions.find(
      (b) => caption.start === b.start
    );

    if (matchingOutput) {
      messages.push(
        { role: 'user', content: caption.text },
        { role: 'assistant', content: matchingOutput.text }
      );
    }
  }

  messages.push({
    role: 'user',
    content: lastCaption.text,
  });

  const res = await generateText({
    model: google('gemini-2.5-flash-lite-preview-06-17'),
    messages,
  });

  const translated: CaptionItem = {
    ...lastCaption,
    text: res.text,
  };

  if (!this.captions[output]) {
    this.captions[output] = [];
  }

  this.captions[output].push(translated);

  const channelId = getSessionKey(this.options);
  const channel = supabase.channel(channelId);

  await channel.send({
    type: 'broadcast',
    event: `onTranscription:${output}`,
    payload: {
      data: this.captions[output].slice(-4),
    },
  });

  // console.log('RES', translated.text);
}

export async function processTranslations(this: SessionInstance) {
  if (!this.options?.translations?.length) {
    //
    return;
  }

  const { language, translations } = this.options;

  const captions = this.captions.default
    .slice(-8)
    .filter((a) => a.isComplete)
    .slice(-5);

  await Promise.all(
    translations.map((translation) =>
      processSingleTranslation.call(this, captions, language, translation)
    )
  );
}
