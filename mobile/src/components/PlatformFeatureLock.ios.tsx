import type { ReactNode } from 'react';

/** Owner-approved fixed iOS capabilities never consult subscription flags. */
export function PlatformFeatureLock({ children }: { feature: string; children: ReactNode }) {
  return <>{children}</>;
}
