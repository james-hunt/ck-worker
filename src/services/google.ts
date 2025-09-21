import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
// Ensure OPENAI_API_KEY environment variable is set

const systemPrompt = `You are a church translator that translates the prompt from English to Spanish. Return only the translated text. Prioritise meaning and tone over literal translation. Ensure that the translation is appropriate for a church context, such as "spirit" usually referring to Holy Spirit.`;

export async function translate(apiKey: string, prompt: string) {
  const google = createGoogleGenerativeAI({
    apiKey,
  });

  const res = await generateText({
    model: google('gemini-2.0-flash'),
    system: systemPrompt,
    prompt,
  });

  return res.text;
}

export async function translateFast(apiKey: string, prompt: string) {
  const google = createGoogleGenerativeAI({
    apiKey,
  });

  const res = await generateText({
    model: google('gemini-2.0-flash-lite'),
    system: systemPrompt,
    prompt,
  });

  return res.text;
}
