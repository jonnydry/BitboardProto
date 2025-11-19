export interface Comment {
  id: string;
  author: string;
  content: string;
  timestamp: number;
}

export interface Board {
  id: string;
  name: string; // Display name e.g. "TECH"
  description: string;
  isPublic: boolean;
  memberCount: number;
}

export interface Post {
  id: string;
  boardId: string; // Link to parent board
  title: string;
  author: string;
  content: string;
  timestamp: number;
  score: number;
  commentCount: number;
  tags: string[];
  url?: string;
  imageUrl?: string;
  linkDescription?: string;
  comments: Comment[];
}

export interface UserState {
  username: string;
  bits: number;
  maxBits: number;
  votedPosts: Record<string, 'up' | 'down'>; // postId -> direction
}

export enum ViewMode {
  FEED = 'FEED',
  CREATE = 'CREATE',
  ABOUT = 'ABOUT',
  SINGLE_BIT = 'SINGLE_BIT'
}