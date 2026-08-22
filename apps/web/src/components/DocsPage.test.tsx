import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DocsPage } from './DocsPage';

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

    await user.click(screen.getByRole('link', { name: 'Operatori' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Operatori si prioritate' })).toHaveFocus(),
    );
  });
});
