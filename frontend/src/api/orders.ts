import client from './client'

import type {
  ApiDataResponse,
  Order,
  OrderCreateRequest,
  OrderRateRequest,
  ShareOrderResponse,
} from '../types'

/**
 * Creates a new order for the authenticated user.
 */
export const createOrder = async (
  payload: OrderCreateRequest,
): Promise<Order> => {
  const { data } = await client.post<Order>('/orders', payload)
  return data
}

/**
 * Returns one specific order by ID.
 */
export const getOrder = async (orderId: number): Promise<Order> => {
  const { data } = await client.get<Order>(`/orders/${orderId}`)
  return data
}

/**
 * Returns the user's active order or null if none exists.
 */
export const getActiveOrder = async (): Promise<Order | null> => {
  const { data } = await client.get<Order | null>('/orders/active')
  return data
}

/**
 * Cancels an active order.
 */
export const cancelOrder = async (orderId: number): Promise<Order> => {
  const { data } = await client.patch<Order>(`/orders/${orderId}/cancel`)
  return data
}

/**
 * Submits a ride rating for a completed order.
 */
export const rateOrder = async (
  orderId: number,
  payload: OrderRateRequest,
): Promise<Order> => {
  const { data } = await client.post<Order>(`/orders/${orderId}/rate`, payload)
  return data
}

/**
 * Generates a public share link token for order tracking.
 */
export const shareOrder = async (
  orderId: number,
): Promise<ShareOrderResponse> => {
  const { data } = await client.post<ApiDataResponse<ShareOrderResponse>>(
    `/orders/${orderId}/share`,
  )
  return data.data
}

/**
 * Fetches order tracking data by public share token.
 */
export const trackOrder = async (shareToken: string): Promise<Order> => {
  const { data } = await client.get<Order>(`/orders/track/${shareToken}`)
  return data
}

export const ordersApi = {
  createOrder,
  getOrder,
  getActiveOrder,
  cancelOrder,
  rateOrder,
  shareOrder,
  trackOrder,
}
