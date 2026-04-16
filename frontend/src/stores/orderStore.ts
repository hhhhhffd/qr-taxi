import { create } from 'zustand'

import { ordersApi } from '../api/orders'
import type {
  Order,
  OrderCreateRequest,
  OrderRateRequest,
  PointBInput,
  RouteResponse,
  Tariff,
  WsMessage,
  WsStatusUpdateMessage,
} from '../types'

interface UpdateFromWsOptions {
  overwrite?: boolean
  shareToken?: string
}

interface OrderStoreState {
  currentOrder: Order | null
  selectedTariff: Tariff | null
  selectedPayment: 'cash' | 'kaspi_qr'
  pointB: PointBInput | null
  routeInfo: RouteResponse | null
  estimatedPrice: number | null
  etaSeconds: number | null
  driverLocation: [number, number] | null
  setPointB: (pointB: PointBInput | null) => void
  setTariff: (tariff: Tariff | null) => void
  setPayment: (method: 'cash' | 'kaspi_qr') => void
  createOrder: (locationSlug: string) => Promise<Order>
  cancelOrder: (orderId: number) => Promise<Order>
  rateOrder: (orderId: number, rating: number, comment?: string) => Promise<Order>
  updateFromWs: (message: WsMessage, options?: UpdateFromWsOptions) => Promise<void>
  checkActiveOrder: () => Promise<Order | null>
}

/**
 * Updates current order state from a status_update payload.
 */
const mergeStatusUpdate = (
  currentOrder: Order,
  message: WsStatusUpdateMessage,
): Order => ({
  ...currentOrder,
  status: message.status,
  driver: message.driver ?? currentOrder.driver,
  estimated_price: message.estimated_price ?? currentOrder.estimated_price,
  final_price: message.final_price ?? currentOrder.final_price,
  updated_at: message.timestamp ?? new Date().toISOString(),
})

export const useOrderStore = create<OrderStoreState>((set, get) => ({
  currentOrder: null,
  selectedTariff: null,
  selectedPayment: 'cash',
  pointB: null,
  routeInfo: null,
  estimatedPrice: null,
  etaSeconds: null,
  driverLocation: null,

  setPointB: (pointB: PointBInput | null) => {
    set({ pointB })
  },

  setTariff: (tariff: Tariff | null) => {
    set({ selectedTariff: tariff })
  },

  setPayment: (method: 'cash' | 'kaspi_qr') => {
    set({ selectedPayment: method })
  },

  createOrder: async (locationSlug: string) => {
    const { pointB, selectedTariff, selectedPayment } = get()
    if (!selectedTariff) {
      throw new Error('Tariff must be selected before creating an order.')
    }

    const payload: OrderCreateRequest = {
      location_slug: locationSlug,
      point_b: pointB,
      tariff: selectedTariff.key,
      payment_method: selectedPayment,
    }
    const order = await ordersApi.createOrder(payload)
    set({
      currentOrder: order,
      estimatedPrice: order.estimated_price,
      pointB: order.point_b,
    })
    return order
  },

  cancelOrder: async (orderId: number) => {
    const order = await ordersApi.cancelOrder(orderId)
    set({
      currentOrder: order,
      estimatedPrice: order.estimated_price,
      pointB: order.point_b,
    })
    return order
  },

  rateOrder: async (orderId: number, rating: number, comment?: string) => {
    const payload: OrderRateRequest = {
      rating,
      comment: comment ?? null,
    }
    const order = await ordersApi.rateOrder(orderId, payload)
    set({
      currentOrder: order,
      estimatedPrice: order.estimated_price,
      pointB: order.point_b,
    })
    return order
  },

  updateFromWs: async (message: WsMessage, options?: UpdateFromWsOptions) => {
    switch (message.type) {
      case 'status_update': {
        if (options?.overwrite) {
          const freshOrder = options.shareToken
            ? await ordersApi.trackOrder(options.shareToken)
            : await ordersApi.getOrder(message.order_id)
          set({
            currentOrder: freshOrder,
            estimatedPrice: freshOrder.estimated_price,
            pointB: freshOrder.point_b,
          })
          return
        }

        set((state) => {
          if (!state.currentOrder || state.currentOrder.id !== message.order_id) {
            return state
          }
          const nextOrder = mergeStatusUpdate(state.currentOrder, message)
          return {
            currentOrder: nextOrder,
            estimatedPrice: nextOrder.estimated_price,
            etaSeconds: message.eta_seconds !== undefined ? message.eta_seconds : state.etaSeconds,
          }
        })
        return
      }
      case 'eta_update':
        set((state) => {
          if (!state.currentOrder || state.currentOrder.id !== message.order_id) {
            return state
          }
          return { etaSeconds: message.eta_seconds }
        })
        return
      case 'driver_location':
        set((state) => {
          if (!state.currentOrder || state.currentOrder.id !== message.order_id) {
            return state
          }
          return { driverLocation: [message.lat, message.lng] }
        })
        return
      case 'ping':
        return
    }
  },

  checkActiveOrder: async () => {
    const activeOrder = await ordersApi.getActiveOrder()
    if (!activeOrder) {
      set({
        currentOrder: null,
        estimatedPrice: null,
        etaSeconds: null,
        driverLocation: null,
      })
      return null
    }

    set({
      currentOrder: activeOrder,
      estimatedPrice: activeOrder.estimated_price,
      pointB: activeOrder.point_b,
    })
    return activeOrder
  },
}))
