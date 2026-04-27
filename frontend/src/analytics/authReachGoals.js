import { metrikaGoal } from './metrika'
import { M } from './metrikaEvents'

/**
 * Единственные точки reachGoal для успешного логина/регистрации (вызывать из AuthModal после res.ok).
 * Не дублировать в AuthContext, checkAuthStatus и т.д.
 */
export function reportAuthLoginSuccess(params) {
  metrikaGoal(M.AUTH_LOGIN_SUCCESS, params)
}

export function reportAuthRegisterSuccess(params) {
  metrikaGoal(M.AUTH_REGISTER_SUCCESS, params)
}
