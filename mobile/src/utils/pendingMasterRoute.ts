import { SUBSCRIPTIONS_APP_ROUTE } from './parseAppInternalRoute';

let pendingMasterRoute: typeof SUBSCRIPTIONS_APP_ROUTE | null = null;

export function setPendingMasterRoute(route: typeof SUBSCRIPTIONS_APP_ROUTE | null): void {
  pendingMasterRoute = route;
}

export function peekPendingMasterRoute(): typeof SUBSCRIPTIONS_APP_ROUTE | null {
  return pendingMasterRoute;
}

export function clearPendingMasterRoute(): void {
  pendingMasterRoute = null;
}
