import type { RouteResponse, Tariff } from '../types'

export const formatPrice = (price: number | null, nullLabel = 'По таксометру'): string => {
  if (price === null) return nullLabel
  return `${price} ₸`
}

// Keep in sync with backend/app/services/tariff_service.py _DEFAULT_CONFIG
export const TARIFFS: Tariff[] = [
  {
    key: 'econom',
    name_ru: 'Эконом',
    name_kz: 'Эконом',
    name_en: 'Economy',
    name_zh: '经济型',
    base_fare: 600,
    per_km: 90,
    car_type: 'sedan'
  },
  {
    key: 'optimal',
    name_ru: 'Оптимал',
    name_kz: 'Оптимал',
    name_en: 'Optimal',
    name_zh: '标准型',
    base_fare: 700,
    per_km: 100,
    car_type: 'sedan'
  },
  {
    key: 'comfort',
    name_ru: 'Комфорт',
    name_kz: 'Комфорт',
    name_en: 'Comfort',
    name_zh: '舒适型',
    base_fare: 850,
    per_km: 120,
    car_type: 'sedan'
  },
  {
    key: 'universal',
    name_ru: 'Универсал',
    name_kz: 'Универсал',
    name_en: 'Universal',
    name_zh: '通用型',
    base_fare: 750,
    per_km: 100,
    car_type: 'universal'
  },
  {
    key: 'minivan',
    name_ru: 'Минивэн',
    name_kz: 'Минивэн',
    name_en: 'Minivan',
    name_zh: '商务车',
    base_fare: 850,
    per_km: 100,
    car_type: 'minivan'
  }
]

const SETTINGS = {
  time_surcharge_after_min: 12,
  time_surcharge_per_min: 20,
  surge_multiplier: 1.0,
  base_km: 2.0 // default assumption for base_km if not in Tariff interface
}

export const calculatePrice = (tariff: Tariff, route: RouteResponse | null): number | null => {
  if (!route) return null
  
  const distance_km = route.distance / 1000
  if (distance_km > 30) return null // Max distance 30km, show "По таксометру" or handle error
  
  const time_min = route.time / 60000
  
  let price = tariff.base_fare
  if (distance_km > SETTINGS.base_km) {
    price = tariff.base_fare + (distance_km - SETTINGS.base_km) * tariff.per_km
  }
  
  if (time_min > SETTINGS.time_surcharge_after_min) {
    price += (time_min - SETTINGS.time_surcharge_after_min) * SETTINGS.time_surcharge_per_min
  }
  
  price = Math.max(Math.floor(price * SETTINGS.surge_multiplier), tariff.base_fare)
  return price
}
