import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMatchMedia } from '../test-media-query';
import { DocsPage } from './DocsPage';

afterEach(() => {
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

describe('DocsPage', () => {
  it('documents the core language and debugger in Romanian', () => {
    const { container } = render(<DocsPage />);

    const title = screen.getByRole('heading', { level: 1, name: 'Pseudocod BAC-RO' });
    expect(title).toBeInTheDocument();
    expect(title).toHaveFocus();
    expect(screen.getByRole('main')).toContainElement(title);
    expect(
      screen.getByRole('heading', { name: 'Debugger si execution trace' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Tablouri unidimensionale si matrice' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/nu fac parte din BAC-RO 1/u)).toBeInTheDocument();
    expect(screen.getByText(/Pentru BAC 2026 ramane aplicabila programa/u)).toBeInTheDocument();
    expect(screen.getByText(/nu adauga automat un newline/u)).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByText('Pe aceasta pagina')).not.toBeInTheDocument();
    expect(screen.getByText('Extra')).toBeInTheDocument();
    expect(screen.queryByText('Contract')).not.toBeInTheDocument();

    const ids = [...container.querySelectorAll<HTMLElement>('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exposes a collapsible table of contents on narrow layouts', async () => {
    const user = userEvent.setup();
    render(<DocsPage />);

    const toggle = screen.getByRole('button', { name: 'Cuprins' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();

    await user.click(toggle);
    const navigation = document.getElementById('docs-navigation');
    expect(navigation).not.toBeNull();
    await user.click(within(navigation as HTMLElement).getByRole('link', { name: 'Operatori' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Operatori si prioritate' })).toHaveFocus(),
    );
  });

  it('restores a directly linked documentation section', async () => {
    window.history.replaceState(null, '', '/?view=docs#operatori');
    render(<DocsPage />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Operatori si prioritate' })).toHaveFocus(),
    );
    const navigation = screen.getByRole('navigation', { name: 'Sectiuni documentatie' });
    expect(within(navigation).getByRole('link', { name: 'Operatori' })).toHaveAttribute(
      'aria-current',
      'location',
    );
  });

  it('closes responsive drawers when their disclosure controls leave the layout', async () => {
    const media = installMatchMedia({ '(max-width: 799px)': true });
    const user = userEvent.setup();
    const { container } = render(<DocsPage />);
    const navigationToggle = screen.getByRole('button', { name: 'Cuprins' });
    const article = container.querySelector('.docs-content');

    await user.click(navigationToggle);
    const navigation = screen.getByRole('navigation', { name: 'Sectiuni documentatie' });
    const navigationLink = within(navigation).getByRole('link', { name: 'Operatori' });
    navigationLink.focus();
    expect(article).toHaveAttribute('inert');

    act(() => media('(max-width: 799px)').setMatches(false));

    expect(navigationToggle).toHaveAttribute('aria-expanded', 'false');
    expect(article).not.toHaveAttribute('inert');
    expect(navigationLink).toHaveFocus();
  });
});
