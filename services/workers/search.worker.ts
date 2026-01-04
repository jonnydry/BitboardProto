// ============================================
// SEARCH WEB WORKER
// ============================================
// Offloads text search/filtering from the main thread
// Uses an "Index & Query" pattern to avoid serializing posts on every keystroke
//
// Messages:
//   UPDATE_INDEX: { posts: SerializedPost[] } - Update the searchable index
//   SEARCH: { query: string, boardId?: string, feedFilter?: string } - Execute search
//
// Responses:
//   INDEX_UPDATED: { count: number } - Index updated successfully
//   SEARCH_RESULTS: { ids: string[], query: string } - Matching post IDs
//
// ============================================

// Simplified post type for search (no methods, serializable)
interface SearchablePost {
  id: string;
  boardId: string;
  title: string;
  author: string;
  authorPubkey?: string;
  content: string;
  tags: string[];
  // Precomputed lowercase for faster search
  titleLower: string;
  authorLower: string;
  contentLower: string;
  tagsLower: string[];
  // Comment content for search
  commentText: string;
}

// In-memory index
let postIndex: Map<string, SearchablePost> = new Map();

// Message types
interface UpdateIndexMessage {
  type: 'UPDATE_INDEX';
  posts: Array<{
    id: string;
    boardId: string;
    title: string;
    author: string;
    authorPubkey?: string;
    content: string;
    tags: string[];
    comments: Array<{ author: string; content: string }>;
  }>;
}

interface SearchMessage {
  type: 'SEARCH';
  query: string;
  requestId: string;
}

type WorkerMessage = UpdateIndexMessage | SearchMessage;

/**
 * Build searchable index from posts
 */
function buildIndex(posts: UpdateIndexMessage['posts']): void {
  const newIndex = new Map<string, SearchablePost>();

  for (const post of posts) {
    // Precompute lowercase strings for fast search
    const commentText = post.comments
      .map(c => `${c.author} ${c.content}`)
      .join(' ')
      .toLowerCase();

    newIndex.set(post.id, {
      id: post.id,
      boardId: post.boardId,
      title: post.title,
      author: post.author,
      authorPubkey: post.authorPubkey,
      content: post.content,
      tags: post.tags,
      titleLower: post.title.toLowerCase(),
      authorLower: post.author.toLowerCase(),
      contentLower: post.content.toLowerCase(),
      tagsLower: post.tags.map(t => t.toLowerCase()),
      commentText,
    });
  }

  postIndex = newIndex;
}

/**
 * Search posts by query
 */
function searchPosts(query: string): string[] {
  if (!query.trim()) {
    // Return all post IDs if no query
    return Array.from(postIndex.keys());
  }

  const queryLower = query.toLowerCase().trim();
  const matchingIds: string[] = [];

  for (const [id, post] of postIndex) {
    // Check title, author, content, tags, and comments
    const matches =
      post.titleLower.includes(queryLower) ||
      post.authorLower.includes(queryLower) ||
      post.contentLower.includes(queryLower) ||
      post.tagsLower.some(tag => tag.includes(queryLower)) ||
      post.commentText.includes(queryLower);

    if (matches) {
      matchingIds.push(id);
    }
  }

  return matchingIds;
}

// Message handler
self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { type } = e.data;

  switch (type) {
    case 'UPDATE_INDEX': {
      const { posts } = e.data;
      buildIndex(posts);
      self.postMessage({ type: 'INDEX_UPDATED', count: postIndex.size });
      break;
    }

    case 'SEARCH': {
      const { query, requestId } = e.data;
      const ids = searchPosts(query);
      self.postMessage({ type: 'SEARCH_RESULTS', ids, query, requestId });
      break;
    }

    default:
      console.warn('[SearchWorker] Unknown message type:', type);
  }
};

// Signal ready
self.postMessage({ type: 'READY' });
