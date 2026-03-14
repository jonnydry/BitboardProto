import type { Conversation } from '../services/dmService';

export function formatDirectMessageTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function getConversationDisplayName(conversation: Conversation): string {
  return (
    conversation.participantName ||
    (conversation.participantPubkey
      ? `${conversation.participantPubkey.slice(0, 8)}...`
      : 'Unknown')
  );
}

export function filterConversations(
  conversations: Conversation[],
  searchQuery: string,
): Conversation[] {
  if (!searchQuery) {
    return conversations;
  }

  const normalizedQuery = searchQuery.toLowerCase();
  return conversations.filter((conversation) => {
    const name = conversation.participantName || conversation.participantPubkey;
    return name.toLowerCase().includes(normalizedQuery);
  });
}
