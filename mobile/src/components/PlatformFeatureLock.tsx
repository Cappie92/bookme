import type { ReactNode } from 'react';
import { FeatureLock } from './FeatureLock';

export function PlatformFeatureLock({ feature, children }: { feature: string; children: ReactNode }) {
  return <FeatureLock feature={feature}>{children}</FeatureLock>;
}
