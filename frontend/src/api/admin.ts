/**
 * Admin API client — locations CRUD, tariffs, order list, analytics.
 */

import client from './client'
import type { TariffSettings } from '../types'

// ---------------------------------------------------------------------------
// Location types
// ---------------------------------------------------------------------------

export interface AdminLocation {
  id: number
  slug: string
  name: string
  lat: number
  lng: number
  hint_ru: string
  hint_kz: string | null
  hint_en: string | null
  address: string | null
  qr_image_url: string | null
  is_active: boolean
  order_count: number
  created_at: string
}

export interface AdminLocationCreateRequest {
  slug: string
  name: string
  lat: number
  lng: number
  hint_ru: string
  hint_kz?: string | null
  hint_en?: string | null
  address?: string | null
  is_active?: boolean
}

// ---------------------------------------------------------------------------
// Order types
// ---------------------------------------------------------------------------

export interface AdminOrder {
  id: number
  status: string
  tariff: string
  estimated_price: number | null
  final_price: number | null
  location_id: number
  location_name: string
  user_id: number
  created_at: string
  completed_at: string | null
  cancelled_at: string | null
}

export interface AdminOrderEvent {
  id: number
  status: string
  meta: Record<string, unknown> | null
  created_at: string
}

export interface AdminOrderDetail extends AdminOrder {
  point_a_lat: number
  point_a_lng: number
  point_a_address: string
  point_b_lat: number | null
  point_b_lng: number | null
  point_b_address: string | null
  driver_id: number | null
  assigned_at: string | null
  arrived_at: string | null
  started_at: string | null
  events: AdminOrderEvent[]
}

// ---------------------------------------------------------------------------
// Analytics types
// ---------------------------------------------------------------------------

export interface HeatmapPoint {
  lat: number
  lng: number
  weight: number
}

export interface AnalyticsSummary {
  total_today: number
  total_week: number
  avg_price: number | null
  avg_wait_seconds: number | null
}

export interface MetabaseEmbedConfig {
  is_configured: boolean
  dashboard_url: string | null
  reason: string | null
}

// ---------------------------------------------------------------------------
// Filter type
// ---------------------------------------------------------------------------

export interface AdminOrderFilter {
  status?: string
  tariff?: string
  location_id?: number
  date_from?: string
  date_to?: string
  limit?: number
  offset?: number
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export const adminApi = {
  // Locations

  /** Fetch all locations (including inactive) with order counts. */
  getLocations: async (): Promise<AdminLocation[]> => {
    const resp = await client.get<{ data: AdminLocation[] }>('/admin/locations')
    return resp.data.data
  },

  /** Create a new QR location. Auto-geocodes address if omitted. */
  createLocation: async (payload: AdminLocationCreateRequest): Promise<AdminLocation> => {
    const resp = await client.post<{ data: AdminLocation }>('/admin/locations', payload)
    return resp.data.data
  },

  /** Update an existing QR location by id. */
  updateLocation: async (id: number, payload: AdminLocationCreateRequest): Promise<AdminLocation> => {
    const resp = await client.put<{ data: AdminLocation }>(`/admin/locations/${id}`, payload)
    return resp.data.data
  },

  /** Toggle is_active for a location. */
  toggleLocation: async (id: number): Promise<AdminLocation> => {
    const resp = await client.patch<{ data: AdminLocation }>(`/admin/locations/${id}/toggle`)
    return resp.data.data
  },

  /** Download the QR PNG for a location using the authenticated API client. */
  downloadQr: async (id: number, slug: string): Promise<void> => {
    const resp = await client.get(`/admin/locations/${id}/qr`, { responseType: 'blob' })
    const url = URL.createObjectURL(resp.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `qr_${slug}.png`
    a.click()
    URL.revokeObjectURL(url)
  },

  // Tariffs

  /** Return the current full tariff configuration. */
  getTariffs: async (): Promise<TariffSettings> => {
    const resp = await client.get<{ data: TariffSettings }>('/admin/settings/tariffs')
    return resp.data.data
  },

  /** Persist updated tariff config to DB and invalidate Redis cache. */
  updateTariffs: async (payload: TariffSettings): Promise<TariffSettings> => {
    const resp = await client.put<{ data: TariffSettings }>('/admin/settings/tariffs', payload)
    return resp.data.data
  },

  // Orders

  /** Fetch a paginated, filtered list of orders. */
  getOrders: async (filter?: AdminOrderFilter): Promise<AdminOrder[]> => {
    const resp = await client.get<{ data: AdminOrder[] }>('/admin/orders', { params: filter })
    return resp.data.data
  },

  /** Fetch full order detail including events timeline. */
  getOrder: async (id: number): Promise<AdminOrderDetail> => {
    const resp = await client.get<{ data: AdminOrderDetail }>(`/admin/orders/${id}`)
    return resp.data.data
  },

  // Analytics

  /** Return heatmap points (location coords weighted by order count). */
  getHeatmap: async (): Promise<HeatmapPoint[]> => {
    const resp = await client.get<{ data: HeatmapPoint[] }>('/admin/analytics/heatmap')
    return resp.data.data
  },

  /** Return summary stats: orders today/week, avg price, avg wait. */
  getSummary: async (): Promise<AnalyticsSummary> => {
    const resp = await client.get<{ data: AnalyticsSummary }>('/admin/analytics/summary')
    return resp.data.data
  },

  /** Return signed Metabase dashboard URL for secure iframe embedding. */
  getMetabaseEmbed: async (): Promise<MetabaseEmbedConfig> => {
    const resp = await client.get<{ data: MetabaseEmbedConfig }>('/admin/analytics/metabase')
    return resp.data.data
  },
}
