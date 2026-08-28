import { describe, expect, it } from 'vitest';
import { BoardType, type Board } from '../../types';
import { INITIAL_BOARDS } from '../../constants';
import { mergeWithInitialBoards } from '../../stores/boardStore';

const topic = (id: string, name: string): Board => ({
  id,
  name,
  description: '',
  isPublic: true,
  memberCount: 0,
  type: BoardType.TOPIC,
});

describe('mergeWithInitialBoards', () => {
  it('keeps the current default catalog and drops retired seed boards', () => {
    const merged = mergeWithInitialBoards([
      topic('b-tech', 'TECH'),
      topic('b-system', 'SYSTEM'),
      topic('b-food', 'FOOD'),
      {
        ...topic('b-mine', 'MINE'),
        createdBy: 'p'.repeat(64),
      },
    ]);

    expect(merged.map((board) => board.id)).toEqual([...INITIAL_BOARDS.map((b) => b.id), 'b-mine']);
  });
});
