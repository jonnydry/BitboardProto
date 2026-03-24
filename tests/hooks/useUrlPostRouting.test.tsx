import React from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUrlPostRouting } from '../../hooks/useUrlPostRouting';
import { ViewMode } from '../../types';

function Harness(props: {
  viewMode: ViewMode;
  selectedBitId: string | null;
  setViewMode: (mode: ViewMode) => void;
  setSelectedBitId: (id: string | null) => void;
}) {
  useUrlPostRouting(props);
  return null;
}

describe('useUrlPostRouting', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('returns to feed when popstate removes the post query param', () => {
    const setViewMode = vi.fn();
    const setSelectedBitId = vi.fn();

    window.history.replaceState(null, '', '/?post=post-1');
    render(
      <Harness
        viewMode={ViewMode.SINGLE_BIT}
        selectedBitId="post-1"
        setViewMode={setViewMode}
        setSelectedBitId={setSelectedBitId}
      />,
    );

    setViewMode.mockClear();
    setSelectedBitId.mockClear();

    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(setSelectedBitId).toHaveBeenCalledWith(null);
    expect(setViewMode).toHaveBeenCalledWith(ViewMode.FEED);
  });

  it('clears the post query with replaceState when returning to feed', () => {
    const setViewMode = vi.fn();
    const setSelectedBitId = vi.fn();
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    window.history.replaceState(null, '', '/?post=post-1');
    render(
      <Harness
        viewMode={ViewMode.FEED}
        selectedBitId={null}
        setViewMode={setViewMode}
        setSelectedBitId={setSelectedBitId}
      />,
    );

    expect(replaceStateSpy).toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });
});
