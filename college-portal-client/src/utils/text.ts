/** Hard server-side limit for a single chat message. */
export const CHAT_TEXT_LIMIT = 4000;

/** Safety cap: a single send attempt must not turn into hundreds of messages. */
const MAX_PARTS = 50;

/**
 * Splits a long message into chunks of at most `limit` UTF-16 units, preferring
 * paragraph, line and word boundaries so the conversation stays readable.
 * Never cuts a surrogate pair (emoji) in half.
 */
export function splitMessageText(text: string, limit = CHAT_TEXT_LIMIT): string[] {
  if (text.length <= limit) return [text];

  const parts: string[] = [];
  let rest = text;

  while (rest.length > limit) {
    const window = rest.slice(0, limit + 1);

    let cut = window.lastIndexOf('\n\n');
    if (cut < limit / 2) cut = window.lastIndexOf('\n');
    if (cut < limit / 2) cut = window.lastIndexOf(' ');
    if (cut <= 0) cut = limit;

    // Do not split an emoji (high surrogate) from its low surrogate.
    if (cut > 0 && cut < rest.length) {
      const code = rest.charCodeAt(cut - 1);
      if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
    }

    const part = rest.slice(0, cut).trimEnd();
    if (part.length > 0) parts.push(part);
    rest = rest.slice(cut).replace(/^\s+/, '');
  }

  if (rest.length > 0) parts.push(rest);
  return parts;
}

export { MAX_PARTS as MAX_MESSAGE_PARTS };
