import { create } from 'zustand'

import { authApi } from '../api/auth'
import type { User } from '../types'

const ACCESS_TOKEN_STORAGE_KEY = 'aparu_access_token'

/**
 * Reads the access token from localStorage.
 */
const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') {
    return null
  }
  return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
}

/**
 * Persists or removes access token in localStorage.
 */
const persistToken = (token: string | null): void => {
  if (typeof window === 'undefined') {
    return
  }
  if (token) {
    window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token)
    return
  }
  window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
}

interface AuthStoreState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  loginWithTelegram: (initData: string, lang?: string) => Promise<User>
  requestPhone: (phone: string) => Promise<User>
  requestOtp: (phone: string) => Promise<void>
  loginWithOtp: (phone: string, otp: string, lang?: string) => Promise<User>
  loginWithWechat: (phone: string, displayName?: string, lang?: string) => Promise<User>
  fetchMe: () => Promise<User | null>
  logout: () => void
  setToken: (token: string | null) => void
}

const initialToken = getStoredToken()

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  user: null,
  token: initialToken,
  isAuthenticated: Boolean(initialToken),
  isLoading: false,

  loginWithTelegram: async (initData: string, lang = 'ru') => {
    set({ isLoading: true })
    try {
      const authResponse = await authApi.loginWithTelegram({
        init_data: initData,
        lang,
      })
      get().setToken(authResponse.access_token)
      set({
        user: authResponse.user,
        isAuthenticated: true,
      })
      return authResponse.user
    } finally {
      set({ isLoading: false })
    }
  },

  requestPhone: async (phone: string) => {
    set({ isLoading: true })
    try {
      const user = await authApi.requestPhone({ phone })
      set({ user })
      return user
    } finally {
      set({ isLoading: false })
    }
  },

  requestOtp: async (phone: string) => {
    await authApi.requestOtp({ phone })
  },

  loginWithOtp: async (phone: string, otp: string, lang = 'ru') => {
    set({ isLoading: true })
    try {
      const authResponse = await authApi.verifyOtp({ phone, otp, lang })
      get().setToken(authResponse.access_token)
      set({ user: authResponse.user, isAuthenticated: true })
      return authResponse.user
    } finally {
      set({ isLoading: false })
    }
  },

  fetchMe: async () => {
    if (!get().token) return null
    try {
      const user = await authApi.getMe()
      set({ user })
      return user
    } catch {
      return null
    }
  },

  loginWithWechat: async (phone: string, displayName?: string, lang = 'ru') => {
    set({ isLoading: true })
    try {
      const authResponse = await authApi.loginWithWechat({ phone, display_name: displayName, lang })
      get().setToken(authResponse.access_token)
      set({ user: authResponse.user, isAuthenticated: true })
      return authResponse.user
    } finally {
      set({ isLoading: false })
    }
  },

  logout: () => {
    persistToken(null)
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    })
  },

  setToken: (token: string | null) => {
    persistToken(token)
    set({
      token,
      isAuthenticated: Boolean(token),
    })
  },
}))
