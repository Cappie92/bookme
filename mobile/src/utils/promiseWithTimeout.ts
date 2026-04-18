/**
 * Оборачивает promise в таймаут. Если promise не резолвится за ms — reject с Error('timeout').
 * Используется для SecureStore/AsyncStorage в Expo Go, где они могут зависать.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    ),
  ]);
}
