import { AxiosError } from 'axios';
import {
  CONNECTIVITY_ERROR_MESSAGE,
  isConnectivityFailure,
  mapLoginRequestError,
} from '@src/utils/apiNetworkError';

describe('apiNetworkError', () => {
  it('detects axios network timeout', () => {
    const err = new AxiosError('timeout of 20000ms exceeded', 'ECONNABORTED');
    expect(isConnectivityFailure(err)).toBe(true);
    expect(mapLoginRequestError(err)).toBe(CONNECTIVITY_ERROR_MESSAGE);
  });

  it('detects err_network without response', () => {
    const err = new AxiosError('Network Error', 'ERR_NETWORK');
    expect(isConnectivityFailure(err)).toBe(true);
  });

  it('maps 401 to credentials message', () => {
    const err = new AxiosError('Unauthorized', undefined, undefined, undefined, {
      status: 401,
      data: { detail: 'bad' },
      statusText: 'Unauthorized',
      headers: {},
      config: {} as any,
    });
    expect(mapLoginRequestError(err)).toBe('Неверный номер телефона или пароль');
  });
});
