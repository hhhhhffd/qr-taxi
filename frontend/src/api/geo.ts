import client from './client'

import type {
  GeoSearchRequest,
  GeoSearchResponse,
  ReverseGeocodeRequest,
  ReverseGeocodeResponse,
  RouteRequest,
  RouteResponse,
} from '../types'

/**
 * Runs forward geocode search for destination autocomplete.
 */
export const searchGeo = async (
  payload: GeoSearchRequest,
): Promise<GeoSearchResponse> => {
  const { data } = await client.post<GeoSearchResponse>('/geo/search', payload)
  return data
}

/**
 * Calculates route distance/time and polyline coordinates.
 */
export const getRoute = async (payload: RouteRequest): Promise<RouteResponse> => {
  const { data } = await client.post<RouteResponse>('/geo/route', payload)
  return data
}

/**
 * Resolves a coordinate pair to a human-readable address.
 */
export const reverseGeocode = async (
  payload: ReverseGeocodeRequest,
): Promise<ReverseGeocodeResponse> => {
  const { data } = await client.post<ReverseGeocodeResponse>(
    '/geo/reverse',
    payload,
  )
  return data
}

export const geoApi = {
  searchGeo,
  getRoute,
  reverseGeocode,
}
