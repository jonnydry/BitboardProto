import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesktopNavChrome } from '../../features/layout/DesktopNavChrome';

describe('DesktopNavChrome', () => {
  it('renders the tray shell and sidebar slot when open', () => {
    render(
      <DesktopNavChrome drawerOpen={true} onCloseDrawer={() => undefined} onOpenDrawer={() => undefined}>
        <div>Sidebar content</div>
      </DesktopNavChrome>,
    );

    expect(screen.getByText('Panel')).toBeInTheDocument();
    expect(screen.getByText('Sidebar content')).toBeInTheDocument();
  });

  it('closes the tray when the close button is clicked', () => {
    const onCloseDrawer = vi.fn();

    render(
      <DesktopNavChrome drawerOpen={true} onCloseDrawer={onCloseDrawer} onOpenDrawer={() => undefined}>
        <div />
      </DesktopNavChrome>,
    );

    fireEvent.click(screen.getByLabelText('Close panel'));
    expect(onCloseDrawer).toHaveBeenCalled();
  });

  it('focuses the close button and restores focus when the tray closes', () => {
    const trigger = <button type="button">Trigger</button>;
    const onCloseDrawer = vi.fn();
    const { rerender } = render(
      <>
        {trigger}
        <DesktopNavChrome drawerOpen={false} onCloseDrawer={onCloseDrawer} onOpenDrawer={() => undefined}>
          <div />
        </DesktopNavChrome>
      </>,
    );

    const triggerButton = screen.getByText('Trigger');
    triggerButton.focus();

    rerender(
      <>
        {trigger}
        <DesktopNavChrome drawerOpen={true} onCloseDrawer={onCloseDrawer} onOpenDrawer={() => undefined}>
          <div />
        </DesktopNavChrome>
      </>,
    );

    expect(screen.getByLabelText('Close panel')).toHaveFocus();

    rerender(
      <>
        {trigger}
        <DesktopNavChrome drawerOpen={false} onCloseDrawer={onCloseDrawer} onOpenDrawer={() => undefined}>
          <div />
        </DesktopNavChrome>
      </>,
    );

    expect(triggerButton).toHaveFocus();
  });

  it('opens the tray when the rail button is clicked while closed', () => {
    const onOpenDrawer = vi.fn();

    render(
      <DesktopNavChrome
        drawerOpen={false}
        onCloseDrawer={() => undefined}
        onOpenDrawer={onOpenDrawer}
      >
        <div />
      </DesktopNavChrome>,
    );

    fireEvent.click(screen.getByLabelText('Open navigation panel'));
    expect(onOpenDrawer).toHaveBeenCalled();
  });

  it('dismisses when the dim strip is clicked', () => {
    const onCloseDrawer = vi.fn();

    render(
      <DesktopNavChrome drawerOpen={true} onCloseDrawer={onCloseDrawer} onOpenDrawer={() => undefined}>
        <div />
      </DesktopNavChrome>,
    );

    fireEvent.click(screen.getByLabelText('Dismiss navigation panel'));
    expect(onCloseDrawer).toHaveBeenCalled();
  });
});
