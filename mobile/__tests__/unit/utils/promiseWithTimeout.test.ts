import { withTimeout } from '@src/utils/promiseWithTimeout';

describe('withTimeout', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('clears the watchdog timer when the wrapped promise wins', async () => {
    jest.useFakeTimers();
    await expect(withTimeout(Promise.resolve('ok'), 3000)).resolves.toBe('ok');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rejects with timeout when the wrapped promise never settles', async () => {
    jest.useFakeTimers();
    const pending = withTimeout(new Promise<string>(() => {}), 3000);
    const expectation = expect(pending).rejects.toThrow('timeout');
    await jest.advanceTimersByTimeAsync(3000);
    await expectation;
    expect(jest.getTimerCount()).toBe(0);
  });
});
