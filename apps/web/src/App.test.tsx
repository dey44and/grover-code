import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App', () => {
  it('navigates between Code and the Romanian language reference', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText('Grover')).toBeInTheDocument();
    expect(screen.queryByText('ready')).not.toBeInTheDocument();
    expect(screen.queryByText('Pas 0')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Input' })).toBeInTheDocument();
    expect(screen.getByText('0/1 citite')).toBeInTheDocument();
    expect(screen.getByLabelText('Valori de intrare')).toHaveAccessibleDescription(
      'Separa valorile cu Enter, spatiu sau virgula',
    );
    expect(screen.getByRole('heading', { name: 'Program' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Documentatie' }));
    const docsTitle = await screen.findByRole('heading', { level: 1, name: 'Pseudocod BAC-RO' });
    expect(docsTitle).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Code' }));
    const programTitle = screen.getByRole('heading', { name: 'Program' });
    await waitFor(() => expect(programTitle).toHaveFocus());
  });

  it('executes one semantic step and exposes the variable transition', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Pas/u }));

    expect(screen.getByRole('cell', { name: '250326' })).toBeInTheDocument();
    expect(screen.getByText('n <- 250326')).toBeInTheDocument();
    expect(screen.getByText('1/1 citite')).toBeInTheDocument();
    expect(screen.getByText('1 pasi')).toBeInTheDocument();
    expect(screen.queryByText('In pauza')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Pas 1, citire: n <- 250326');
    expect(screen.getByRole('button', { name: /Inapoi/u })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /Inapoi/u }));
    expect(
      screen.getByText('Inapoi: starea anterioara a fost restaurata; 0 pasi executati raman.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Reset:/u }));
    expect(screen.getByText('Executia a fost resetata la starea initiala.')).toBeInTheDocument();
  });

  it('switches to the official rail representation without losing the program', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getByRole('button', { name: 'Format BAC' }));

    expect(screen.getByTestId('exam-preview')).toBeInTheDocument();
    expect(container.querySelector('.workbench')).toHaveAttribute('data-editor-mode', 'exam');
    expect(screen.getAllByRole('button', { name: /Final pentru blocul/u }).length).toBeGreaterThan(
      0,
    );

    await user.click(screen.getByRole('button', { name: 'Sursa' }));
    expect(container.querySelector('.workbench')).toHaveAttribute('data-editor-mode', 'source');
  });

  it('does not classify an externally loaded example as a custom edit', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByLabelText('Editor de pseudocod');
    const selector = screen.getByLabelText('Programe sablon');

    await user.selectOptions(selector, 'suma');

    expect(selector).toHaveValue('suma');
  });

  it('appends missing input without discarding debugger progress', async () => {
    const user = userEvent.setup();
    render(<App />);
    fireEvent.change(screen.getByLabelText('Valori de intrare'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Pas:/u }));

    expect(screen.getByRole('button', { name: 'Ruleaza programul' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Pas:/u })).toBeDisabled();
    await waitFor(() => expect(screen.getByLabelText('Valori suplimentare')).toHaveFocus());

    await user.type(screen.getByLabelText('Valori suplimentare'), '7');
    await user.click(screen.getByRole('button', { name: 'Adauga' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Pas:/u })).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: /Pas:/u }));

    expect(screen.getByRole('cell', { name: '7' })).toBeInTheDocument();
    expect(screen.getByText('n <- 7')).toBeInTheDocument();
  });
});
