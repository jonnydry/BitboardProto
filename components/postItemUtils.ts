import type { Comment, Post, UserState } from '../types';

export function formatPostTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return '< 1h';
  if (hours > 24) return `${Math.floor(hours / 24)}d`;
  return `${hours}h`;
}

export function isPostEncryptedWithoutKey(post: Post): boolean {
  if (!post.isEncrypted) return false;
  if (post.content === '[Encrypted - Access Required]' || post.title === '[Encrypted]') {
    return true;
  }
  if (post.encryptedContent && post.content === post.encryptedContent) {
    return true;
  }
  return false;
}

export function isOwnPost(
  post: Pick<Post, 'author' | 'authorPubkey'>,
  userState: UserState,
): boolean {
  if (!userState.identity) return false;
  return post.authorPubkey === userState.identity.pubkey || post.author === userState.username;
}

export function canVoteOnPost(userState: UserState, hasInvested: boolean): boolean {
  return Boolean(userState.identity) && (userState.bits > 0 || hasInvested);
}

export function getPostVoteTitle(args: {
  direction: 'up' | 'down';
  userState: UserState;
  isActive: boolean;
  hasInvested: boolean;
}): string {
  const { direction, userState, isActive, hasInvested } = args;
  if (!userState.identity) {
    return 'Connect identity to vote with bits';
  }

  if (userState.bits <= 0 && !hasInvested) {
    return 'No bits remaining today';
  }

  if (isActive) {
    return direction === 'up'
      ? 'Retract upvote and refund 1 bit'
      : 'Retract downvote and refund 1 bit';
  }

  if (hasInvested) {
    return 'Switch vote direction at no extra bit cost';
  }

  return direction === 'up'
    ? 'Spend 1 bit to upvote this post'
    : 'Spend 1 bit to downvote this post';
}

export function buildPreviewCommentTree(args: {
  allComments: Comment[];
  commentTree: Comment[];
  isFullPage: boolean;
  previewLimit: number;
  userPubkey?: string;
}): Comment[] {
  const { allComments, commentTree, isFullPage, previewLimit, userPubkey } = args;

  if (isFullPage) {
    return commentTree;
  }

  if (allComments.length === 0) {
    return [];
  }

  if (allComments.length <= previewLimit) {
    return commentTree;
  }

  const commentMap = new Map<string, Comment>();
  for (const comment of allComments) {
    commentMap.set(comment.id, comment);
  }

  const sortedByTime = [...allComments].sort((a, b) => b.timestamp - a.timestamp);
  const userReply = userPubkey
    ? allComments.find((comment) => comment.authorPubkey === userPubkey)
    : null;
  const previewIds = new Set<string>();

  const addWithParentChain = (comment: Comment) => {
    previewIds.add(comment.id);
    let parentId = comment.parentId;
    while (parentId) {
      const parent = commentMap.get(parentId);
      if (!parent) break;
      previewIds.add(parent.id);
      parentId = parent.parentId;
    }
  };

  if (userReply) {
    addWithParentChain(userReply);
  }

  let added = userReply ? 1 : 0;
  for (const comment of sortedByTime) {
    if (added >= previewLimit) break;
    if (!previewIds.has(comment.id)) {
      addWithParentChain(comment);
      added++;
    }
  }

  const hasPreviewDescendantCache = new Map<string, boolean>();

  const hasPreviewDescendant = (comment: Comment): boolean => {
    const cached = hasPreviewDescendantCache.get(comment.id);
    if (cached !== undefined) return cached;

    if (previewIds.has(comment.id)) {
      hasPreviewDescendantCache.set(comment.id, true);
      return true;
    }

    if (comment.replies && comment.replies.length > 0) {
      const result = comment.replies.some((reply) => hasPreviewDescendant(reply));
      hasPreviewDescendantCache.set(comment.id, result);
      return result;
    }

    hasPreviewDescendantCache.set(comment.id, false);
    return false;
  };

  const filterTree = (comments: Comment[]): Comment[] => {
    const result: Comment[] = [];
    for (const comment of comments) {
      if (hasPreviewDescendant(comment)) {
        result.push({
          ...comment,
          replies: comment.replies ? filterTree(comment.replies) : [],
        });
      }
    }
    return result;
  };

  return filterTree(commentTree);
}
