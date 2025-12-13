import { ModelMessage, generateText } from 'ai';
import { SessionInstance } from './instance.js';
import { inputLanguages, outputLanguages } from '../languages.js';
import {
  CaptionItem,
  type InputLanguage,
  type OutputLanguage,
} from '../types.js';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createFireworks } from '@ai-sdk/fireworks';
import { supabase } from './supabase.js';
import { getSessionKey } from '../lib.js';
import { rules } from '../rules/rules.js';

const getSystemPrompt = (input: InputLanguage, output: OutputLanguage) => {
  const inputLabel = inputLanguages[input];
  const outputLabel = outputLanguages[output];
  return `
    You are a professional translator for live church sermons.

    Translate the most recent message from ${inputLabel} (${input}) into ${outputLabel} (${output}).

    Use natural spoken language appropriate for congregational listening. Translate key theological terms consistently throughout the session.

    Translate naturally and conversationally, prioritising meaning, intent, and tone over literal wording.
    Adapt idioms, figures of speech, and theological language into natural equivalents in the target language.
    Preserve the speaker's intent and emphasis.

    Use church-appropriate terminology.
    For example, "spirit" typically refers to the Holy Spirit unless context clearly indicates otherwise.

    Return ONLY the translated text in ${outputLabel}.
    Do NOT include explanations, alternatives, commentary, or quotation marks.
  `.trim();
};

function getRules(accountId: string, input: InputLanguage) {
  try {
    const rule = rules[accountId as keyof typeof rules];
    return rule?.input || null;
  } catch (e) {
    return null;
  }
}

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

// const fireworks = createFireworks({
//   apiKey: process.env.FIREWORKS_API_KEY ?? '',
// });

export async function processSingleTranslation(
  this: SessionInstance,
  captions: CaptionItem[],
  input: InputLanguage,
  output: OutputLanguage
) {
  const system = getSystemPrompt(input, output);
  const rules = getRules(this.options.accountId, input);
  const combinedSystem = rules
    ? `${system}\n\nAdditional Context: ${rules}`
    : system;
  const inputCaptions = captions.slice(-4, -1);
  const lastCaption = captions.slice(-1).pop();
  const outputCaptions = (this.captions[output] || []).slice(-6);

  // This shouldn't happen
  if (!lastCaption) {
    return;
  }

  const messages: ModelMessage[] = [
    { role: 'system', content: combinedSystem },
  ];

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
    model: google('gemini-2.5-flash-lite'),
    // model: google('gemini-2.5-flash'),
    // model: fireworks('accounts/fireworks/models/gpt-oss-20b'),
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
