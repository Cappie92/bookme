import { completePasswordMutationLogout } from '@src/auth/passwordMutationLogout';


describe('completePasswordMutationLogout', () => {
  it('clears the canonical auth session before routing to login', async () => {
    const calls: string[] = [];
    const logout = jest.fn(async () => {
      calls.push('logout');
    });
    const replace = jest.fn((_path: '/login') => {
      calls.push('replace');
    });

    await completePasswordMutationLogout(logout, replace);

    expect(logout).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/login');
    expect(calls).toEqual(['logout', 'replace']);
  });

  it('does not navigate if canonical logout fails', async () => {
    const logout = jest.fn(async () => {
      throw new Error('storage failure');
    });
    const replace = jest.fn();

    await expect(completePasswordMutationLogout(logout, replace)).rejects.toThrow(
      'storage failure'
    );
    expect(replace).not.toHaveBeenCalled();
  });
});
