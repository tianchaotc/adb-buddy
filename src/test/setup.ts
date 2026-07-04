/**
 * Vitest setup — imports @testing-library/jest-dom for DOM matchers.
 */
import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement matchMedia; some Fluent UI components read it.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    value: () => ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
