import { localStatus } from '../../scripts/local-supabase.mjs';

export async function capturedLink(email, type) {
  const status = localStatus();
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await fetch(`${status.MAILPIT_URL}/api/v1/messages`);
    const inbox = await response.json();
    for (const item of inbox.messages ?? []) {
      if (!item.To?.some((recipient) => recipient.Address === email)) continue;
      const message = await (await fetch(`${status.MAILPIT_URL}/api/v1/message/${item.ID}`)).json();
      const html = message.HTML ?? '';
      const hash = html.match(/token_hash=([a-f0-9]{32,128})/i)?.[1];
      if (hash && html.includes(`type=${type}`)) return hash;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Expected local email template/link was not captured.');
}
