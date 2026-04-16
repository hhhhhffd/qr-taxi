import axios, { AxiosHeaders } from 'axios'
import type { AxiosError, InternalAxiosRequestConfig } from 'axios'

import type { AuthResponse } from '../types'

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

const ACCESS_TOKEN_STORAGE_KEY = 'aparu_access_token'

/**
 * Sets the Authorization header for an outgoing Axios request.
 */
const applyAuthorizationHeader = (
  config: InternalAxiosRequestConfig,
  token: string,
): void => {
  const headers = config.headers instanceof AxiosHeaders
    ? config.headers
    : AxiosHeaders.from(config.headers)
  headers.set('Authorization', `Bearer ${token}`)
  config.headers = headers
}

/**
 * Clears local auth state when token refresh fails.
 */
const clearAuthState = async (): Promise<void> => {
  const { useAuthStore } = await import('../stores/authStore')
  useAuthStore.setState({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: false,
  })
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
  }
}

/**
 * Requests a new access token via refresh cookie and syncs the auth store.
 */
const refreshAccessToken = async (): Promise<string | null> => {
  try {
    const response = await axios.post<AuthResponse>('/api/auth/refresh', undefined, {
      withCredentials: true,
    })
    const { access_token, user } = response.data
    const { useAuthStore } = await import('../stores/authStore')
    useAuthStore.setState({
      user,
      token: access_token,
      isAuthenticated: true,
      isLoading: false,
    })
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, access_token)
    }
    return access_token
  } catch {
    await clearAuthState()
    return null
  }
}

const client = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

let refreshPromise: Promise<string | null> | null = null

client.interceptors.request.use(async (config) => {
  const { useAuthStore } = await import('../stores/authStore')
  const token = useAuthStore.getState().token
  if (token) {
    applyAuthorizationHeader(config, token)
  }
  return config
})

/**
 * Shows an error toast for the given axios error.
 * Uses the API's `detail` field if available, otherwise falls back to a
 * translated generic message.
 */
const showErrorToast = async (error: AxiosError): Promise<void> => {
  const { useToastStore } = await import('../stores/toastStore')
  const detail = (error.response?.data as { detail?: string } | undefined)?.detail
  const status = error.response?.status

  let message: string
  if (detail) {
    message = detail
  } else if (!error.response) {
    // Network error / no response at all
    const { default: i18n } = await import('../i18n')
    message = i18n.t('errors.network')
  } else {
    const { default: i18n } = await import('../i18n')
    message = status === 429
      ? i18n.t('errors.rate_limited')
      : i18n.t('errors.generic')
  }

  useToastStore.getState().addToast(message, 'error')
}

client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined
    const statusCode = error.response?.status

    // Handle 401 with token refresh
    if (
      statusCode === 401
      && originalRequest
      && !originalRequest._retry
      && !originalRequest.url?.includes('/auth/refresh')
    ) {
      originalRequest._retry = true

      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null
        })
      }

      const nextToken = await refreshPromise
      if (nextToken) {
        applyAuthorizationHeader(originalRequest, nextToken)
        return client(originalRequest)
      }

      return Promise.reject(error)
    }

    // Show toast for all non-401 errors (skip silent requests marked with _noToast)
    const cfg = error.config as RetriableRequestConfig & { _noToast?: boolean } | undefined
    if (statusCode !== 401 && !cfg?._noToast) {
      await showErrorToast(error)
    }

    return Promise.reject(error)
  },
)

export default client
