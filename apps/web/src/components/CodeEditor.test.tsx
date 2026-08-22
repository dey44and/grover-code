import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CodeEditor } from './CodeEditor';

describe('CodeEditor syntax projection', () => {
  it('recognizes accented keywords and does not start comments inside strings', async () => {
    const { container } = render(
      <CodeEditor
        diagnostics={[]}
        onChange={vi.fn()}
        value={'scrie "https://exemplu" // daca\nDacă nu fals atunci\n'}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.cm-bac-comment')).toHaveTextContent('// daca');
    });
    expect(container.querySelector('.cm-bac-string')).toHaveTextContent('"https://exemplu"');
    expect(
      [...container.querySelectorAll('.cm-bac-keyword')].map((element) => element.textContent),
    ).toEqual(expect.arrayContaining(['scrie', 'Dacă', 'nu', 'fals', 'atunci']));
  });
});
