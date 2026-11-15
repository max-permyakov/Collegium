// A notification stores the SPA location it belongs to ("/news",
// "/chats/{id}", "/profile?tab=referrals"). Opening that section on your own —
// from the sidebar, a direct URL or a notification toast — should retire the
// matching unread rows, so the bell is not the only way to read them.
//
// This mirrors CollegePortal.Infrastructure/Notifications/NotificationUrlMatcher
// on the server: the client decides which rows to grey out immediately, the
// server persists it through POST /notifications/read-section.

const CLUB_URL_PREFIX = '/clubs/';
const CLUB_CHAT_URL_PREFIX = '/chats/club/';

export interface NotificationSection {
  path: string;
  tab: string | null;
}

function readTab(query: string): string | null {
  for (const part of query.split('&')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    if (part.slice(0, separator).toLowerCase() !== 'tab') continue;

    let value = part.slice(separator + 1);
    try {
      value = decodeURIComponent(value);
    } catch {
      // Malformed escape: compare the raw value instead of throwing.
    }
    return value.trim().toLowerCase() || null;
  }
  return null;
}

/** Parses a relative SPA location; anything else cannot match a section. */
export function parseSection(url: string | null | undefined): NotificationSection | null {
  const raw = url?.trim();
  if (!raw || raw.length > 500 || !raw.startsWith('/') || raw.includes('\\') || raw.startsWith('//')) {
    return null;
  }

  const queryIndex = raw.indexOf('?');
  let path = queryIndex < 0 ? raw : raw.slice(0, queryIndex);
  const query = queryIndex < 0 ? '' : raw.slice(queryIndex + 1);

  // A route fragment never changes which section the URL points at.
  const hashIndex = path.indexOf('#');
  if (hashIndex >= 0) path = path.slice(0, hashIndex);
  path = path.replace(/\/+$/, '');

  if (!path) path = '/';

  // Older links point at /clubs/{id} while the chat itself lives at
  // /chats/club/{id}; both spellings are the same section.
  if (path.toLowerCase().startsWith(CLUB_URL_PREFIX) && path.length > CLUB_URL_PREFIX.length) {
    path = CLUB_CHAT_URL_PREFIX + path.slice(CLUB_URL_PREFIX.length);
  }

  return { path, tab: readTab(query.split('#')[0]) };
}

/**
 * True when a notification belongs to the opened section. A page-wide
 * notification has no tab and matches any tab of that page; a tab-scoped one
 * needs that exact tab.
 */
export function isSameSection(
  notificationUrl: string | null | undefined,
  openedUrl: string | null | undefined,
): boolean {
  const target = parseSection(notificationUrl);
  const opened = parseSection(openedUrl);
  if (!target || !opened) return false;
  if (target.path.toLowerCase() !== opened.path.toLowerCase()) return false;

  return target.tab === null || target.tab === opened.tab;
}
