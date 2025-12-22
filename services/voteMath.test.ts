import { describe, expect, it } from 'vitest';
import {
  computeBitCost,
  computeOptimisticUpdate,
  computeRollback,
  computeVoteScoreDelta,
} from './voteMath';

describe('voteMath', () => {
  it('computeBitCost: new vote costs 1', () => {
    expect(computeBitCost(null, 'up')).toBe(1);
    expect(computeBitCost(null, 'down')).toBe(1);
  });

  it('computeBitCost: switching direction is free', () => {
    expect(computeBitCost('up', 'down')).toBe(0);
    expect(computeBitCost('down', 'up')).toBe(0);
  });

  it('computeBitCost: repeating same direction retracts and refunds', () => {
    expect(computeBitCost('up', 'up')).toBe(-1);
    expect(computeBitCost('down', 'down')).toBe(-1);
  });

  it('computeVoteScoreDelta matches rules', () => {
    expect(computeVoteScoreDelta(null, 'up')).toBe(1);
    expect(computeVoteScoreDelta(null, 'down')).toBe(-1);
    expect(computeVoteScoreDelta('up', 'down')).toBe(-2);
    expect(computeVoteScoreDelta('down', 'up')).toBe(2);
    expect(computeVoteScoreDelta('up', 'up')).toBe(-1);
    expect(computeVoteScoreDelta('down', 'down')).toBe(1);
  });

  it('optimistic update: first vote spends a bit and sets votedPosts', () => {
    const u = computeOptimisticUpdate(null, 'up', 10, {}, 'p1');
    expect(u.newBits).toBe(9);
    expect(u.newVotedPosts).toEqual({ p1: 'up' });
    expect(u.scoreDelta).toBe(1);
  });

  it('optimistic update: retract refunds bit and removes votedPosts key', () => {
    const u = computeOptimisticUpdate('up', 'up', 3, { p1: 'up' }, 'p1');
    expect(u.newBits).toBe(4);
    expect(u.newVotedPosts).toEqual({});
    expect(u.scoreDelta).toBe(-1);
  });

  it('rollback reverses optimisticUpdate', () => {
    const optimistic = computeOptimisticUpdate(null, 'down', 10, {}, 'p1');
    const rollback = computeRollback(optimistic, {}, 'p1');
    expect(rollback.bitAdjustment).toBe(-optimistic.bitCost);
    expect(rollback.previousVotedPosts).toEqual({});
    expect(rollback.scoreDelta).toBe(-optimistic.scoreDelta);
  });
});




















