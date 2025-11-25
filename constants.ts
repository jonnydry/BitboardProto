import { Post, Board } from './types';

export const MAX_DAILY_BITS = 100;

export const INITIAL_BOARDS: Board[] = [
  {
    id: 'b-system',
    name: 'SYSTEM',
    description: 'Official announcements and rules.',
    isPublic: true,
    memberCount: 1204
  },
  {
    id: 'b-tech',
    name: 'TECH',
    description: 'Hardware, software, and cybernetics.',
    isPublic: true,
    memberCount: 843
  },
  {
    id: 'b-random',
    name: 'RANDOM',
    description: 'Off-topic discussions and noise.',
    isPublic: true,
    memberCount: 420
  },
  {
    id: 'b-private',
    name: 'DARKNET',
    description: 'Encrypted comms.',
    isPublic: false,
    memberCount: 5
  }
];

export const INITIAL_POSTS: Post[] = [
  {
    id: 'welcome-post',
    boardId: 'b-system',
    title: 'Welcome to BitBoard v2.0',
    author: 'system/admin',
    content: 'BitBoard has been upgraded to support decentralized frequencies (Boards). You can now navigate to specific sub-sectors using the Directory. The Main Feed aggregates high-signal content from all public sectors.',
    timestamp: Date.now(),
    score: 999,
    commentCount: 0,
    tags: ['announcement', 'system', 'update'],
    comments: []
  }
];