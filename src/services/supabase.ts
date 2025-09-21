import { createClient } from '@supabase/supabase-js';
import { SessionInstance } from './instance.js';

export const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
});

export async function publishMessage(this: SessionInstance) {
  const captions = this.captions.default.slice(-8);
  const last = this.captions.default.slice(-1).pop();

  if (!last) {
    return;
  }

  // Return if interimResults results are off and the last caption is not complete
  if (!this.options.interimResults && !last.isComplete) {
    return;
  }

  const channel = supabase.channel(this.options.accountId);

  await channel.send({
    type: 'broadcast',
    event: last?.isComplete ? 'onTranscription' : 'onPartial',
    payload: {
      data: captions,
    },
  });
}
