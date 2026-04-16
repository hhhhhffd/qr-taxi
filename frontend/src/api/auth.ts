import client from './client'

import type { AuthResponse, TelegramAuthRequest, User } from '../types'

interface PhoneRequestPayload {
  phone: string
}

interface OtpRequestPayload {
  phone: string
}

interface OtpVerifyPayload {
  phone: string
  otp: string
  lang?: string
}

interface WechatAuthPayload {
  phone: string
  display_name?: string
  lang?: string
}

/**
 * Authenticates a Telegram Mini App user and receives an access token.
 */
export const loginWithTelegram = async (
  payload: TelegramAuthRequest,
): Promise<AuthResponse> => {
  const { data } = await client.post<AuthResponse>('/auth/telegram', payload)
  return data
}

/**
 * Sends the user's phone number after Telegram contact request.
 */
export const requestPhone = async (
  payload: PhoneRequestPayload,
): Promise<User> => {
  const { data } = await client.post<User>('/auth/phone', payload)
  return data
}

/**
 * Requests an OTP to be sent (logged to server console for MVP).
 */
export const requestOtp = async (payload: OtpRequestPayload): Promise<void> => {
  await client.post('/auth/otp/request', payload)
}

/**
 * Verifies the OTP and returns a JWT pair for web users.
 */
export const verifyOtp = async (payload: OtpVerifyPayload): Promise<AuthResponse> => {
  const { data } = await client.post<AuthResponse>('/auth/otp/verify', payload)
  return data
}

/**
 * Authenticates a WeChat H5 user via the fake phone number dialog.
 */
export const loginWithWechat = async (payload: WechatAuthPayload): Promise<AuthResponse> => {
  const { data } = await client.post<AuthResponse>('/auth/wechat', payload)
  return data
}

/**
 * Refreshes JWT tokens using the refresh cookie.
 */
export const refreshAuth = async (): Promise<AuthResponse> => {
  const { data } = await client.post<AuthResponse>('/auth/refresh')
  return data
}

/**
 * Returns profile data for the current authenticated user.
 */
export const getMe = async (): Promise<User> => {
  const { data } = await client.get<User>('/auth/me')
  return data
}

export const authApi = {
  loginWithTelegram,
  requestPhone,
  requestOtp,
  verifyOtp,
  loginWithWechat,
  refreshAuth,
  getMe,
}
