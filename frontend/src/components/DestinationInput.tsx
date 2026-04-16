import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { geoApi } from '../api/geo'
import type { GeoSearchResult, PointBInput } from '../types'

interface DestinationInputProps {
  onSelect: (point: PointBInput) => void
  onClear?: () => void
  currentLocation?: { lat: number; lng: number }
  /** Inline mode: no wrapper bg/icon, plain input — use inside a styled row */
  inline?: boolean
  placeholder?: string
}

export default function DestinationInput({
  onSelect,
  onClear,
  currentLocation,
  inline = false,
  placeholder,
}: DestinationInputProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeoSearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipSearchRef = useRef(false)
  const searchVersionRef = useRef(0)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const currentLat = currentLocation?.lat
  const currentLng = currentLocation?.lng

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [])

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false
      return
    }

    if (!query.trim()) {
      searchVersionRef.current += 1
      setResults([])
      setIsOpen(false)
      setLoading(false)
      setHasSearched(false)
      if (onClear) onClear()
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    const requestVersion = ++searchVersionRef.current

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setHasSearched(false)
      try {
        const payload: { text: string; latitude?: number; longitude?: number } = { text: query }
        if (currentLat !== undefined && currentLng !== undefined) {
          payload.latitude = currentLat
          payload.longitude = currentLng
        }
        const res = await geoApi.searchGeo(payload)
        if (requestVersion !== searchVersionRef.current) return
        setResults(res.results || [])
        setIsOpen(true)
        setHasSearched(true)
      } catch {
        // Error toast handled by API client interceptor
      } finally {
        if (requestVersion !== searchVersionRef.current) return
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, currentLat, currentLng])

  const handleSelect = (item: GeoSearchResult) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    searchVersionRef.current += 1
    skipSearchRef.current = true
    setQuery(item.name || item.address)
    setIsOpen(false)
    setLoading(false)
    setResults([])
    setHasSearched(false)
    inputRef.current?.blur()
    onSelect({
      lat: item.lat,
      lng: item.lng,
      address: item.name ? `${item.name}, ${item.address}` : item.address,
    })
  }

  const resolvedPlaceholder = placeholder ?? t('order.point_b_placeholder')

  const dropdown = (
    <>
      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-100 max-h-60 overflow-y-auto z-50">
          {results.map((item, idx) => (
            <button
              key={idx}
              onClick={() => handleSelect(item)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
            >
              <div className="font-medium text-aparu-textMain">{item.name || item.address}</div>
              {item.name && <div className="text-sm text-aparu-textMuted truncate">{item.address}</div>}
            </button>
          ))}
        </div>
      )}
      {isOpen && !loading && hasSearched && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-100 z-50">
          <p className="px-4 py-5 text-sm text-center text-aparu-textMuted">
            {t('order.no_results')}
          </p>
        </div>
      )}
    </>
  )

  if (inline) {
    return (
      <div ref={containerRef} className="relative flex-1">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0) setIsOpen(true) }}
          placeholder={resolvedPlaceholder}
          className="w-full text-base text-aparu-textMain placeholder:text-aparu-textMuted focus:outline-none bg-transparent"
        />
        {loading && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2">
            <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-aparu-brand border-t-transparent" />
          </div>
        )}
        {dropdown}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <div className="absolute left-3 text-gray-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0) setIsOpen(true) }}
          placeholder={resolvedPlaceholder}
          className="w-full bg-gray-100 border-none rounded-xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-aparu-brand outline-none transition-all"
        />
        {loading && (
          <div className="absolute right-3">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-aparu-brand border-t-transparent" />
          </div>
        )}
      </div>
      {dropdown}
    </div>
  )
}
