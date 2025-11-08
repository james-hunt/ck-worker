import {
  AnyObjectSchema,
  array,
  boolean,
  InferType,
  object,
  string,
  ValidationError,
} from 'yup';
import { inputLanguages, outputLanguages } from './languages.js';
import type {
  CaptionOptions,
  Captions,
  OutputLanguage,
  InputLanguage,
} from './types.js';
import { WebSocket } from 'ws';

const inputLanguagesKeys = Object.keys(inputLanguages);
const outputLanguageKeys = Object.keys(outputLanguages);

export function parseUrlParams(params: URLSearchParams): CaptionOptions {
  const options: CaptionOptions = {
    language: params.get('language') as InputLanguage,
    translations: (params.getAll('t9n') as OutputLanguage[]) || [],
    accountId: params.get('accountId') as string,
    profileId: (params.get('profileId') as string) || undefined,
    keywords: (params.getAll('kw') as string[]) || [],
    blocked: (params.getAll('bk') as string[]) || [],
    interimResults: JSON.parse(params.get('interimResults') || 'false')
      ? true
      : false,
    profanityFilter: JSON.parse(params.get('profanityFilter') || 'true')
      ? true
      : false,
  };
  return options;
}

export function getInitialCaptions(options: CaptionOptions): Captions {
  const captions: Captions = {
    default: [],
  };

  for (const lang of options.translations) {
    captions[lang] = [];
  }

  return captions;
}

export const validationSchema = object({
  accountId: string().uuid().required(),
  profileId: string().uuid(),
  language: string().oneOf(inputLanguagesKeys).required(),
  translations: array()
    .of(string().oneOf(outputLanguageKeys).required())
    .required(),
  keywords: array().of(string()).required(),
  blocked: array().of(string()).required(),
  interimResults: boolean().required(),
  profanityFilter: boolean().required(),
});

export const wsIsOpen = (ws: WebSocket | null): boolean => {
  return !!ws && ws.readyState !== WebSocket.OPEN;
};

export async function validateSchema<T extends AnyObjectSchema>(
  validationSchema: T,
  values: Record<string, any>,
  strict: boolean = true
): Promise<InferType<T>> {
  return await validationSchema
    .validate(values, {
      abortEarly: false,
      stripUnknown: strict,
    })
    .catch((e: ValidationError) => {
      const errors: Record<string, string> = {};

      for (const error of e.inner) {
        // Push child object error up to parent for better error messaging
        const { path } = error;
        const [parentPath] = path?.split('.') || [];

        if (!path) {
          continue;
        }

        let message = error.errors.join(' - ');

        // Handle required messaging
        if (
          ['required', 'nullable', 'optionality'].includes(error.type as string)
        ) {
          if (message.split(' ')[0] === path) {
            message = 'This field is required';
          }
        }

        if (error.type === 'typeError') {
          switch (error.params?.type) {
            case 'number':
              message = 'Please enter a valid number';
              break;
            default:
              if (message.includes('but the final value was')) {
                message = 'Please enter a valid value';
              }
              break;
          }
        }

        errors[path] = message;

        if (parentPath !== path) {
          errors[parentPath] = message;
        }
      }

      throw errors;
    });
}

export function getSessionKey(params: CaptionOptions): string {
  if (params.profileId) {
    return [params.accountId, params.profileId].join(':');
  }

  return params.accountId;
}
