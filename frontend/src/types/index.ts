/**
 * Shared TypeScript interfaces and DTOs matching backend schemas.
 */

export type LanguageCode = 'ru' | 'kz' | 'en'

export interface User {
  id: number
  telegram_id: number | null  // null for web/wechat users
  platform: string            // 'telegram' | 'wechat' | 'web'
  first_name: string
  username: string | null
  phone: string | null
  lang: string
  is_admin: boolean
  onboarded: boolean
}

export interface Driver {
  id: number
  name: string
  car_model: string
  car_color: string
  plate: string
  phone: string
  photo_url: string | null
  rating: number
  car_class: string
  status: string
  lat: number
  lng: number
}

export interface DriverBrief {
  id: number
  name: string
  car_model: string
  car_color: string
  plate: string
  phone: string
  rating: number
  photo_url: string | null
}

export interface Location {
  id: number
  slug: string
  name: string
  lat: number
  lng: number
  hint: string
  address: string | null
}

export interface OrderPoint {
  lat: number
  lng: number
  address: string
}

export type OrderStatus =
  | 'searching'
  | 'driver_assigned'
  | 'driver_arriving'
  | 'driver_arrived'
  | 'ride_started'
  | 'ride_completed'
  | 'no_drivers'
  | 'cancelled'

export interface Order {
  id: number
  status: OrderStatus
  point_a: OrderPoint
  point_b: OrderPoint | null
  tariff: string
  payment_method: string
  estimated_price: number | null
  final_price: number | null
  driver: DriverBrief | null
  share_token: string | null
  rating: number | null
  created_at: string
  updated_at: string
}

export interface TariffConfig {
  base_fare: number
  base_km: number
  per_km: number
  free_wait_min: number
  wait_per_min: number
  car_type: string
}

export interface Tariff {
  key: string
  name_ru: string
  name_kz: string
  name_en: string
  name_zh?: string
  base_fare: number
  per_km: number
  car_type: string
}

export interface TariffSettings {
  tariffs: Record<string, TariffConfig>
  time_surcharge_after_min: number
  time_surcharge_per_min: number
  max_distance_km: number
  search_timeout_sec: number
  driver_wait_timeout_min: number
  surge_multiplier: number
}

export interface GeoSearchResult {
  address: string
  lat: number
  lng: number
  name: string | null
}

export interface RouteResponse {
  distance: number
  time: number
  coordinates: number[][]
  bbox: [[number, number], [number, number]] | null
}

export interface TelegramAuthRequest {
  init_data: string
  lang?: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user: User
}

export interface PointBInput {
  lat: number
  lng: number
  address: string
}

export interface OrderCreateRequest {
  location_slug: string
  point_b?: PointBInput | null
  tariff: string
  payment_method?: string
}

export interface OrderRateRequest {
  rating: number
  comment?: string | null
}

export interface QrScanRequest {
  location_id: number
  lang?: string
}

export interface QrScanResponse {
  id: number
}

export interface GeoSearchRequest {
  text: string
  latitude?: number
  longitude?: number
}

export interface GeoSearchResponse {
  results: GeoSearchResult[]
}

export interface RoutePointInput {
  lat: number
  lng: number
}

export interface RouteRequest {
  points: RoutePointInput[]
}

export interface ReverseGeocodeRequest {
  latitude: number
  longitude: number
}

export interface ReverseGeocodeResponse {
  address: string
  name: string | null
}

export interface ShareOrderResponse {
  share_token: string
  url: string
}

export interface ApiDataResponse<T> {
  data: T
}

export interface WsStatusUpdateMessage {
  type: 'status_update'
  order_id: number
  status: OrderStatus
  driver?: DriverBrief | null
  estimated_price?: number | null
  final_price?: number | null
  eta_seconds?: number | null
  timestamp?: string
}

export interface WsEtaUpdateMessage {
  type: 'eta_update'
  order_id: number
  eta_seconds: number
}

export interface WsDriverLocationMessage {
  type: 'driver_location'
  order_id: number
  lat: number
  lng: number
}

export interface WsPingMessage {
  type: 'ping'
}

export type WsMessage =
  | WsStatusUpdateMessage
  | WsEtaUpdateMessage
  | WsDriverLocationMessage
  | WsPingMessage
