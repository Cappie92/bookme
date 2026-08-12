export async function completePasswordMutationLogout(
  logout: () => Promise<void>,
  replace: (path: '/login') => void
): Promise<void> {
  await logout();
  replace('/login');
}
