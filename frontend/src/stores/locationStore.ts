import axios from 'axios'
import { create } from 'zustand'

import { locationsApi } from '../api/locations'
import type { Location } from '../types'

interface LocationStoreState {
  location: Location | null
  loading: boolean
  error: string | null
  fetchBySlug: (slug: string, lang?: string) => Promise<Location>
}

/**
 * Extracts a meaningful API error message.
 */
const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data as { detail?: string } | undefined
    return detail?.detail ?? error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Unknown error'
}

export const useLocationStore = create<LocationStoreState>((set) => ({
  location: null,
  loading: false,
  error: null,

  fetchBySlug: async (slug: string, lang = 'ru') => {
    set({ loading: true, error: null })
    try {
      const location = await locationsApi.getLocation(slug, lang)
      set({ location, loading: false, error: null })
      return location
    } catch (error) {
      set({ loading: false, error: getErrorMessage(error) })
      throw error
    }
  },
}))
