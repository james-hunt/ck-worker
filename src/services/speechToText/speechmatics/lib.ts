import { CaptionItem, InputLanguage } from '../../../types.js';

// type SmAlt = { content?: string; confidence?: number; language?: string };
// type SmResultLoose = {
//   type?: 'word' | 'punctuation' | 'entity';
//   start_time?: number;
//   end_time?: number;
//   alternatives?: SmAlt[];
//   attaches_to?: 'previous' | 'next' | 'both' | 'none';
//   is_eos?: boolean;
// };

type CaptionEvent =
  | { type: 'partial'; caption: CaptionItem } // update the live, incomplete caption
  | { type: 'final'; caption: CaptionItem } // emit a completed sentence caption
  | { type: 'clear_partial' }; // optional: clear live caption

type FlushReason = 'eos' | 'utterance' | 'maxWords' | 'maxDuration';

type SmResultStrict = {
  type: 'word' | 'punctuation' | 'entity';
  start_time: number;
  end_time: number;
  alternatives: { content: string }[]; // always present
  attaches_to?: 'previous' | 'next' | 'both' | 'none';
  is_eos?: boolean;
};

function formatTime(ms: number): number {
  return parseFloat(ms.toFixed(2));
}

function normalizeResults(results: unknown): SmResultStrict[] {
  if (!Array.isArray(results)) return [];
  const out: SmResultStrict[] = [];

  for (const r of results as any[]) {
    if (!r) continue;
    if (r.type !== 'word' && r.type !== 'punctuation' && r.type !== 'entity')
      continue;
    if (typeof r.start_time !== 'number' || typeof r.end_time !== 'number')
      continue;

    const c = r.alternatives?.[0]?.content;
    if (typeof c !== 'string' || !c.length) continue;

    out.push({
      type: r.type,
      start_time: r.start_time,
      end_time: r.end_time,
      alternatives: [{ content: c }],
      attaches_to: r.attaches_to,
      is_eos: r.is_eos,
    });
  }
  return out;
}

function tok(t: SmResultStrict) {
  return t.alternatives[0].content;
}

function appendToken(out: string, t: SmResultStrict) {
  const attaches = t.attaches_to ?? 'none';
  const needsSpace =
    out.length > 0 && attaches !== 'previous' && attaches !== 'both';
  return out + (needsSpace ? ' ' : '') + tok(t);
}

function render(tokens: SmResultStrict[]) {
  let out = '';
  for (const t of tokens) out = appendToken(out, t);
  return out.trim();
}

export class SpeechmaticsSentenceStream {
  private committed: SmResultStrict[] = [];
  private committedKey = new Set<string>();
  private tail: SmResultStrict[] = [];

  private lastPartialText = '';

  // heuristics (tune these)
  private maxWordsBeforeFlush = 14;
  private maxDurationBeforeFlush = 3.5; // seconds

  constructor(private emit: (e: CaptionItem) => void) {}

  onMessage(msg: any) {
    if (msg.message === 'AddTranscript') {
      this.onFinalTokens(normalizeResults(msg.results));
      // try to emit any complete sentences from committed
      this.flushIfNeeded();
      // after final tokens, also update partial (because tail “meaning” changes)
      this.emitPartialIfChanged();
      return;
    }

    if (msg.message === 'AddPartialTranscript') {
      this.tail = normalizeResults(msg.results);
      // always emit partial updates as the sentence builds
      this.emitPartialIfChanged();
      return;
    }

    // if (msg.message === 'EndOfUtterance') {
    //   this.flushAll('utterance');
    //   this.emit({ type: 'clear_partial' });
    //   this.lastPartialText = '';
    //   return;
    // }
  }

  private onFinalTokens(tokens: SmResultStrict[]) {
    for (const t of tokens) {
      const k = this.key(t);
      if (!this.committedKey.has(k)) {
        this.committedKey.add(k);
        this.committed.push(t);
      }
    }
  }

  private flushIfNeeded() {
    // 1) flush all complete sentences (EOS) first
    const flushedAny = this.flushEosSentences();

    // 2) if no EOS, apply heuristics (optional)
    if (!flushedAny && this.shouldHeuristicFlush()) {
      this.flushAll(this.chooseHeuristicReason());
    }
  }

  private flushEosSentences(): boolean {
    let did = false;
    let startIdx = 0;

    for (let i = 0; i < this.committed.length; i++) {
      const t = this.committed[i];
      if (t.type === 'punctuation' && t.is_eos) {
        const slice = this.committed.slice(startIdx, i + 1);
        this.emitFinalCaption(slice, 'eos');
        did = true;
        startIdx = i + 1;
      }
    }

    if (startIdx > 0) {
      const remaining = this.committed.slice(startIdx);
      this.committed = remaining;
      this.committedKey = new Set(remaining.map(this.key));
    }

    return did;
  }

  private flushAll(reason: FlushReason) {
    if (!this.committed.length) return;
    this.emitFinalCaption(this.committed, reason);
    this.committed = [];
    this.committedKey.clear();
  }

  private emitFinalCaption(tokens: SmResultStrict[], reason: FlushReason) {
    const text = render(tokens);
    if (!text) return;

    const start = formatTime(tokens[0].start_time);
    const end = formatTime(tokens[tokens.length - 1].end_time);
    // Remove prefix punctuation
    const nextText = text.replace(/^[\.,;:!\?]+/, '').trim();

    this.emit({
      start,
      duration: formatTime(end - start),
      text: nextText,
      t: start,
      isComplete: true,
    });
  }

  private emitPartialIfChanged() {
    const tokens = [...this.committed, ...this.tail];
    const text = render(tokens);

    // throttle: only emit if changed meaningfully
    if (!text || text === this.lastPartialText) return;
    this.lastPartialText = text;

    const start = formatTime(tokens[0]?.start_time ?? 0);
    const end = formatTime(tokens[tokens.length - 1]?.end_time ?? start);
    // Remove prefix punctuation
    const nextText = text.replace(/^[\.,;:!\?]+/, '').trim();

    this.emit({
      start,
      duration: formatTime(end - start),
      text: nextText,
      t: start,
      isComplete: false,
    });
  }

  private shouldHeuristicFlush() {
    const wordCount = this.committed.filter((t) => t.type === 'word').length;
    if (wordCount >= this.maxWordsBeforeFlush) return true;

    if (this.committed.length) {
      const dur =
        this.committed[this.committed.length - 1].end_time -
        this.committed[0].start_time;
      if (dur >= this.maxDurationBeforeFlush) return true;
    }
    return false;
  }

  private chooseHeuristicReason(): FlushReason {
    const wordCount = this.committed.filter((t) => t.type === 'word').length;
    if (wordCount >= this.maxWordsBeforeFlush) return 'maxWords';
    return 'maxDuration';
  }

  private key(t: SmResultStrict) {
    return `${t.type}:${t.start_time.toFixed(3)}-${t.end_time.toFixed(3)}:${tok(t)}`;
  }
}

export function getLanguageCode(lang: InputLanguage): string {
  switch (lang) {
    case 'en-US':
    case 'en-AU':
    case 'en-GB':
    case 'en-NZ':
      return 'en';
    default:
      return lang;
  }
}

// zh: 'Chinese (Mandarin, Simplified)',
//   // 'zh-CN': 'Chinese (Mandarin, Simplified)',
//   // 'zh-Hans': 'Chinese (Mandarin, Simplified)',
//   'zh-TW': 'Chinese (Mandarin, Traditional)',
//   // 'zh-Hant': 'Chinese (Mandarin, Traditional)',
//   'zh-HK': 'Chinese (Cantonese, Traditional)',
