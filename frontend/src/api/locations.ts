import type { AxiosRequestConfig } from 'axios'

import client from './client'

import type { Location, QrScanRequest, QrScanResponse } from '../types'

type SilentConfig = AxiosRequestConfig & { _noToast?: boolean }

/**
 * Fetches an active QR location by slug.
 */
export const getLocation = async (
  slug: string,
  lang = 'ru',
): Promise<Location> => {
  const config: SilentConfig = { params: { lang }, _noToast: true }
  const { data } = await client.get<Location>(`/locations/${slug}`, config)
  return data
}

/**
 * Records a QR scan event for analytics.
 */
export const recordQrScan = async (
  payload: QrScanRequest,
): Promise<QrScanResponse> => {
  const { data } = await client.post<QrScanResponse>('/qr-scans', payload)
  return data
}

export const locationsApi = {
  getLocation,
  recordQrScan,
}
