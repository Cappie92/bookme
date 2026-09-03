export type PendingMasterRoute = '/' | '/subscriptions';

let pendingMasterRoute: PendingMasterRoute | null = null;

export function setPendingMasterRoute(route: PendingMasterRoute | null): void {
  pendingMasterRoute = route;
}

export function peekPendingMasterRoute(): PendingMasterRoute | null {
  return pendingMasterRoute;
}

export function clearPendingMasterRoute(): void {
  pendingMasterRoute = null;
}
