import { useEffect } from 'react';
import { router } from 'expo-router';
import type { UnauthenticatedWelcomeAction } from './authFlowRouting';

/**
 * Idempotent unauthenticated welcome redirect.
 * A thrown replace is not latched: the next pathname, readiness, or revision change retries.
 * didRedirect does not suppress the redirect.
 */
export function useUnauthenticatedWelcomeRedirect(input: {
  action: UnauthenticatedWelcomeAction;
  pathname: string;
  navigationReady: boolean;
  didRedirect: boolean;
  revision: string;
}): void {
  const { action, pathname, navigationReady, didRedirect, revision } = input;
  useEffect(() => {
    if (action !== 'replace-welcome') return;
    try {
      router.replace('/welcome');
    } catch {
      // The next pathname, readiness, or revision change retries.
    }
  }, [action, pathname, navigationReady, didRedirect, revision]);
}
