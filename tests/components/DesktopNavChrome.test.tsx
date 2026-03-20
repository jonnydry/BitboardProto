import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesktopNavChrome } from '../../features/layout/DesktopNavChrome';
import { ViewMode } from '../../types';

describe('DesktopNavChrome', () => {
  it('focuses the close button and restores focus when the drawer closes', () => {
    const trigger = <button type="button">Trigger</button>;
    const onCloseDrawer = vi.fn();
    const { rerender } = render(
      <>
        {trigger}
        <DesktopNavChrome
          drawerOpen={false}
          onCloseDrawer={onCloseDrawer}
          navigateToBoard={() => undefined}
          onSetViewMode={() => undefined}
        >
          <div>Sidebar Content</div>
        </DesktopNavChrome>
      </>,
    );

    const triggerButton = screen.getByText('Trigger');
    triggerButton.focus();

    rerender(
      <>
        {trigger}
        <DesktopNavChrome
          drawerOpen={true}
          onCloseDrawer={onCloseDrawer}
          navigateToBoard={() => undefined}
          onSetViewMode={() => undefined}
        >
          <div>Sidebar Content</div>
        </DesktopNavChrome>
      </>,
    );

    expect(screen.getByLabelText('Close menu')).toHaveFocus();

    rerender(
      <>
        {trigger}
        <DesktopNavChrome
          drawerOpen={false}
          onCloseDrawer={onCloseDrawer}
          navigateToBoard={() => undefined}
          onSetViewMode={() => undefined}
        >
          <div>Sidebar Content</div>
        </DesktopNavChrome>
      </>,
    );

    expect(triggerButton).toHaveFocus();
  });

  it('uses quick access cards for navigation when open', () => {
    const onCloseDrawer = vi.fn();
    const onSetViewMode = vi.fn();

    render(
      <DesktopNavChrome
        drawerOpen={true}
        onCloseDrawer={onCloseDrawer}
        navigateToBoard={() => undefined}
        onSetViewMode={onSetViewMode}
      >
        <div>Sidebar Content</div>
      </DesktopNavChrome>,
    );

    expect(screen.getByText('Control Deck')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Board Directory'));

    expect(onSetViewMode).toHaveBeenCalledWith(ViewMode.BROWSE_BOARDS);
    expect(onCloseDrawer).toHaveBeenCalled();
  });
});
