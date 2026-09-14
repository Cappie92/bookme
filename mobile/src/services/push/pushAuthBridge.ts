import { bumpPushSessionGeneration } from './pushSessionGuard';
import { deactivateCurrentPushInstallation } from './pushRegistration';

/**
 * Called from AuthContext immediately before wiping a live session.
 * Bump first so in-flight registration cannot PUT for the next user;
 * then best-effort DELETE while the outgoing token is still available.
 */
export async function onAuthSessionWillClear(): Promise<void> {
  bumpPushSessionGeneration();
  try {
    await deactivateCurrentPushInstallation();
  } catch {
    /* never block logout / session replace */
  }
}
