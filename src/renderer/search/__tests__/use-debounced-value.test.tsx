/** @jest-environment jsdom */

import { act, renderHook } from '@testing-library/react';

import { useDebouncedValue } from '../use-debounced-value';

describe('useDebouncedValue', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('publishes only the latest value after the full delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: '' } },
    );

    rerender({ value: 'nee' });
    act(() => jest.advanceTimersByTime(200));
    rerender({ value: 'needle' });
    act(() => jest.advanceTimersByTime(299));
    expect(result.current).toBe('');

    act(() => jest.advanceTimersByTime(1));
    expect(result.current).toBe('needle');
  });

  it('debounces clearing the current value', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'needle' } },
    );

    rerender({ value: '' });
    act(() => jest.advanceTimersByTime(299));
    expect(result.current).toBe('needle');

    act(() => jest.advanceTimersByTime(1));
    expect(result.current).toBe('');
  });
});
