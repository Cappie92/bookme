/**
 * Оборачивает promise в таймаут. Если promise не резолвится за ms — reject с Error('timeout').
 * Используется для SecureStore/AsyncStorage в Expo Go, где они могут зависать.
 * Снимает watchdog timer, когда исходный promise завершается раньше таймаута.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}
