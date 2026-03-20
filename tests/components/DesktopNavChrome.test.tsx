import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesktopNavChrome } from '../../features/layout/DesktopNavChrome';
import { ViewMode } from '../../types';

describe('DesktopNavChrome', () => {
  it('renders the drawer with quick navigation rows when open', () => {
    render(
      <DesktopNavChrome
        drawerOpen={true}
        onCloseDrawer={() => undefined}
        onOpenDrawer={() => undefined}
        navigateToBoard={() => undefined}
        onSetViewMode={() => undefined}
      />,
    );

    expect(screen.getByText('Navigate')).toBeInTheDocument();
    expect(screen.getByText('Global Feed')).toBeInTheDocument();
    expect(screen.getByText('Board Directory')).toBeInTheDocument();
    expect(screen.getByText('Discover Nostr')).toBeInTheDocument();
  });

  it('closes the drawer when the close button is clicked', () => {
    const onCloseDrawer = vi.fn();

    render(
      <DesktopNavChrome
        drawerOpen={true}
        onCloseDrawer={onCloseDrawer}
        onOpenDrawer={() => undefined}
        navigateToBoard={() => undefined}
        onSetViewMode={() => undefined}
      />,
    );

    fireEvent.click(screen.getByLabelText('Close navigation'));
    expect(onCloseDrawer).toHaveBeenCalled();
  });

  it('navigates to BROWSE_BOARDS when Board Directory is clicked', () => {
    const onCloseDrawer = vi.fn();
    const onSetViewMode = vi.fn();

    render(
      <DesktopNavChrome
        drawerOpen={true}
        onCloseDrawer={onCloseDrawer}
        onOpenDrawer={() => undefined}
        navigateToBoard={() => undefined}
        onSetViewMode={onSetViewMode}
      />,
    );

    fireEvent.click(screen.getByText('Board Directory'));

    expect(onSetViewMode).toHaveBeenCalledWith(ViewMode.BROWSE_BOARDS);
    expect(onCloseDrawer).toHaveBeenCalled();
  });

  it('focuses the close button and restores focus when the drawer closes', () => {
    const trigger = <button type="button">Trigger</button>;
    const onCloseDrawer = vi.fn();
    const { rerender } = render(
      <>
        {trigger}
        <DesktopNavChrome
          drawerOpen={false}
          onCloseDrawer={onCloseDrawer}
          onOpenDrawer={() => undefined}
          navigateToBoard={() => undefined}
          onSetViewMode={() => undefined}
        />
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
          onOpenDrawer={() => undefined}
          navigateToBoard={() => undefined}
          onSetViewMode={() => undefined}
        />
      </>,
    );

    expect(screen.getByLabelText('Close navigation')).toHaveFocus();

    rerender(
      <>
        {trigger}
        <DesktopNavChrome
          drawerOpen={false}
          onCloseDrawer={onCloseDrawer}
          onOpenDrawer={() => undefined}
          navigateToBoard={() => undefined}
          onSetViewMode={() => undefined}
        />
      </>,
    );

    expect(triggerButton).toHaveFocus();
  });

  it('opens the drawer when the rail button is clicked while closed', () => {
    const onOpenDrawer = vi.fn();

    render(
      <DesktopNavChrome
        drawerOpen={false}
        onCloseDrawer={() => undefined}
        onOpenDrawer={onOpenDrawer}
        navigateToBoard={() => undefined}
        onSetViewMode={() => undefined}
      />,
    );

    fireEvent.click(screen.getByLabelText('Open navigation panel'));
    expect(onOpenDrawer).toHaveBeenCalled();
  });
});
