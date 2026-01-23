import type { Post, Board, Comment } from '../types';

/**
 * Recursively collect all unique author pubkeys from a comment and its replies
 */
function collectCommentAuthors(comment: Comment, authors: Set<string>): void {
  if (comment.authorPubkey) {
    authors.add(comment.authorPubkey);
  }

  // Recursively process replies
  if (comment.replies && Array.isArray(comment.replies)) {
    for (const reply of comment.replies) {
      collectCommentAuthors(reply, authors);
    }
  }
}

/**
 * Calculate the number of unique members (authors) for a board
 * by counting unique authorPubkeys from posts and comments (including nested replies)
 */
export function calculateBoardMemberCount(boardId: string, posts: Post[]): number {
  const memberPubkeys = new Set<string>();

  // Count unique authors from posts in this board
  for (const post of posts) {
    if (post.boardId === boardId) {
      // Add post author if they have a pubkey
      if (post.authorPubkey) {
        memberPubkeys.add(post.authorPubkey);
      }

      // Add comment authors (including nested replies) if they have pubkeys
      if (post.comments && Array.isArray(post.comments)) {
        for (const comment of post.comments) {
          collectCommentAuthors(comment, memberPubkeys);
        }
      }
    }
  }

  return memberPubkeys.size;
}

/**
 * Calculate member counts for multiple boards at once
 * Returns a Map of boardId -> memberCount
 */
export function calculateBoardMemberCounts(boards: Board[], posts: Post[]): Map<string, number> {
  const memberCounts = new Map<string, number>();

  for (const board of boards) {
    const count = calculateBoardMemberCount(board.id, posts);
    memberCounts.set(board.id, count);
  }

  return memberCounts;
}

/**
 * Enrich boards with real member counts from posts
 * Returns new board objects with updated memberCount values
 */
export function enrichBoardsWithMemberCounts(boards: Board[], posts: Post[]): Board[] {
  const memberCounts = calculateBoardMemberCounts(boards, posts);

  return boards.map(board => ({
    ...board,
    memberCount: memberCounts.get(board.id) ?? 0,
  }));
}
