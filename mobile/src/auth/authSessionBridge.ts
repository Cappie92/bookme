/** Связка API interceptor → AuthContext.clearAuth (без циклического import client↔AuthContext). */
let onInvalidSession: (() => void) | null = null;

export function registerInvalidSessionHandler(handler: (() => void) | null): void {
  onInvalidSession = handler;
}

export function notifyInvalidSession(): void {
  onInvalidSession?.();
}
