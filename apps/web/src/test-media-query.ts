import { vi } from 'vitest';

interface ControlledMediaQuery {
  readonly list: MediaQueryList;
  setMatches: (matches: boolean) => void;
}

export const installMatchMedia = (
  initialMatches: Readonly<Record<string, boolean>>,
): ((media: string) => ControlledMediaQuery) => {
  const queries = new Map<string, ControlledMediaQuery>();

  const getQuery = (media: string): ControlledMediaQuery => {
    const existing = queries.get(media);
    if (existing !== undefined) return existing;

    let matches = initialMatches[media] ?? false;
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const list = {
      get matches() {
        return matches;
      },
      media,
      onchange: null,
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'change' && typeof listener === 'function') {
          listeners.add(listener);
        }
      },
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'change' && typeof listener === 'function') {
          listeners.delete(listener);
        }
      },
      addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeListener: (listener: (event: MediaQueryListEvent) => void) =>
        listeners.delete(listener),
      dispatchEvent: (event: Event) => {
        listeners.forEach((listener) => listener(event as MediaQueryListEvent));
        return true;
      },
    } as unknown as MediaQueryList;

    const controlled: ControlledMediaQuery = {
      list,
      setMatches: (nextMatches) => {
        matches = nextMatches;
        const event = { matches, media } as MediaQueryListEvent;
        listeners.forEach((listener) => listener(event));
        list.onchange?.(event);
      },
    };
    queries.set(media, controlled);
    return controlled;
  };

  vi.stubGlobal(
    'matchMedia',
    vi.fn((media: string) => getQuery(media).list),
  );
  return getQuery;
};
