type GmailMessageSummary = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
  starred: boolean;
};

type GmailMessage = GmailMessageSummary & {
  body: string;
  htmlBody: string;
  replyTo: string;
};

type GmailListSnapshot = {
  messages: GmailMessageSummary[];
  nextPageToken: string | null;
};

const connectionStates = new Map<string, boolean>();
const messageLists = new Map<string, GmailListSnapshot>();
const messageDetails = new Map<string, GmailMessage>();
const messageDetailRequests = new Map<string, Promise<GmailMessage>>();
const cacheGenerations = new Map<string, number>();

function accountKey(accountEmail: string): string {
  return accountEmail.trim().toLowerCase();
}

export function getCachedGmailConnection(accountEmail: string): boolean | null {
  return connectionStates.get(accountKey(accountEmail)) ?? null;
}

export function setCachedGmailConnection(accountEmail: string, connected: boolean): void {
  connectionStates.set(accountKey(accountEmail), connected);
}

export function getCachedGmailList(accountEmail: string, queryKey: string): GmailListSnapshot | null {
  return messageLists.get(`${accountKey(accountEmail)}:${queryKey}`) ?? null;
}

export function setCachedGmailList(accountEmail: string, queryKey: string, snapshot: GmailListSnapshot): void {
  messageLists.set(`${accountKey(accountEmail)}:${queryKey}`, snapshot);
}

export function getCachedGmailMessage(accountEmail: string, messageId: string): GmailMessage | null {
  return messageDetails.get(`${accountKey(accountEmail)}:${messageId}`) ?? null;
}

export function setCachedGmailMessage(accountEmail: string, message: GmailMessage): void {
  messageDetails.set(`${accountKey(accountEmail)}:${message.id}`, message);
}

export function loadCachedGmailMessage(
  accountEmail: string,
  messageId: string,
  load: () => Promise<GmailMessage>,
): Promise<GmailMessage> {
  const key = `${accountKey(accountEmail)}:${messageId}`;
  const cached = messageDetails.get(key);
  if (cached) return Promise.resolve(cached);
  const existingRequest = messageDetailRequests.get(key);
  if (existingRequest) return existingRequest;

  const generation = cacheGenerations.get(accountKey(accountEmail)) ?? 0;
  const request = load()
    .then((message) => {
      if ((cacheGenerations.get(accountKey(accountEmail)) ?? 0) === generation) {
        messageDetails.set(key, message);
      }
      return message;
    })
    .finally(() => messageDetailRequests.delete(key));
  messageDetailRequests.set(key, request);
  return request;
}

export function removeCachedGmailMessage(accountEmail: string, messageId: string): void {
  const prefix = `${accountKey(accountEmail)}:`;
  messageDetails.delete(`${prefix}${messageId}`);
  for (const [key, snapshot] of messageLists) {
    if (key.startsWith(prefix) && snapshot.messages.some((message) => message.id === messageId)) {
      messageLists.set(key, {
        ...snapshot,
        messages: snapshot.messages.filter((message) => message.id !== messageId),
      });
    }
  }
}

export function updateCachedGmailUnread(accountEmail: string, messageId: string, unread: boolean): void {
  const prefix = `${accountKey(accountEmail)}:`;
  const detail = messageDetails.get(`${prefix}${messageId}`);
  if (detail) messageDetails.set(`${prefix}${messageId}`, { ...detail, unread });
  for (const [key, snapshot] of messageLists) {
    if (!key.startsWith(prefix)) continue;
    // Unread-only lists may not contain a newly unread message. Reload them.
    if (key.endsWith(":true")) messageLists.delete(key);
    else messageLists.set(key, { ...snapshot, messages: snapshot.messages.map((message) => message.id === messageId ? { ...message, unread } : message) });
  }
}

export function clearGmailSessionCache(accountEmail?: string): void {
  if (!accountEmail) {
    const accounts = new Set([...messageDetailRequests.keys()].map((key) => key.split(":", 1)[0]));
    for (const account of accounts) cacheGenerations.set(account, (cacheGenerations.get(account) ?? 0) + 1);
    connectionStates.clear();
    messageLists.clear();
    messageDetails.clear();
    return;
  }

  const normalizedAccount = accountKey(accountEmail);
  const prefix = `${normalizedAccount}:`;
  cacheGenerations.set(normalizedAccount, (cacheGenerations.get(normalizedAccount) ?? 0) + 1);
  connectionStates.delete(normalizedAccount);
  for (const key of messageLists.keys()) if (key.startsWith(prefix)) messageLists.delete(key);
  for (const key of messageDetails.keys()) if (key.startsWith(prefix)) messageDetails.delete(key);
  for (const key of messageDetailRequests.keys()) if (key.startsWith(prefix)) messageDetailRequests.delete(key);
}
