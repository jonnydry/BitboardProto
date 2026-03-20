import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewMode } from '../../types';
import { MobileDrawer } from '../../features/layout/MobileDrawer';

describe('MobileDrawer', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  it('locks body scroll when open and unlocks it when closed', () => {
    const { rerender } = render(
      <MobileDrawer
        isOpen={true}
        onClose={() => undefined}
        viewMode={ViewMode.FEED}
        activeBoardId={null}
        onSetViewMode={() => undefined}
        onNavigateGlobal={() => undefined}
        userState={{ bits: 2, maxBits: 4 }}
        bookmarkedCount={0}
        isNostrConnected={true}
      />,
    );

    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <MobileDrawer
        isOpen={false}
        onClose={() => undefined}
        viewMode={ViewMode.FEED}
        activeBoardId={null}
        onSetViewMode={() => undefined}
        onNavigateGlobal={() => undefined}
        userState={{ bits: 2, maxBits: 4 }}
        bookmarkedCount={0}
        isNostrConnected={true}
      />,
    );

    expect(document.body.style.overflow).toBe('');
  });

  it('invokes navigation callbacks and renders sidebar children', () => {
    const onClose = vi.fn();
    const onSetViewMode = vi.fn();
    const onNavigateGlobal = vi.fn();
    render(
      <MobileDrawer
        isOpen={true}
        onClose={onClose}
        viewMode={ViewMode.FEED}
        activeBoardId={null}
        onSetViewMode={onSetViewMode}
        onNavigateGlobal={onNavigateGlobal}
        identity={{ npub: 'npub1234567890' }}
        userState={{ bits: 2, maxBits: 4 }}
        bookmarkedCount={2}
        isNostrConnected={true}
      >
        <div>Sidebar Child</div>
      </MobileDrawer>,
    );

    expect(screen.getByText('Sidebar Child')).toBeInTheDocument();

    fireEvent.click(screen.getByText('SAVED (2)'));
    expect(onSetViewMode).toHaveBeenCalledWith(ViewMode.BOOKMARKS);
    expect(onClose).toHaveBeenCalled();

    fireEvent.click(screen.getByText('GLOBAL_FEED'));
    expect(onNavigateGlobal).toHaveBeenCalled();
  });

  it('closes on escape', () => {
    const onClose = vi.fn();
    render(
      <MobileDrawer
        isOpen={true}
        onClose={onClose}
        viewMode={ViewMode.FEED}
        activeBoardId={null}
        onSetViewMode={() => undefined}
        onNavigateGlobal={() => undefined}
        userState={{ bits: 2, maxBits: 4 }}
        bookmarkedCount={0}
        isNostrConnected={true}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('does not mark global feed active when a board is selected', () => {
    render(
      <MobileDrawer
        isOpen={true}
        onClose={() => undefined}
        viewMode={ViewMode.FEED}
        activeBoardId={'board-1'}
        onSetViewMode={() => undefined}
        onNavigateGlobal={() => undefined}
        userState={{ bits: 2, maxBits: 4 }}
        bookmarkedCount={0}
        isNostrConnected={true}
      />,
    );

    expect(screen.getByText('GLOBAL_FEED').closest('button')).not.toHaveClass('bg-terminal-text');
  });
});
