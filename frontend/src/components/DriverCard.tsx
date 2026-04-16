import { useTranslation } from 'react-i18next'
import type { DriverBrief } from '../types'

interface DriverCardProps {
  driver: DriverBrief
}

export default function DriverCard({ driver }: DriverCardProps) {
  const { t } = useTranslation()
  const initials = driver.name ? driver.name.charAt(0).toUpperCase() : '?'

  return (
    <div className="bg-white rounded-xl border border-aparu-border p-4 w-full flex items-center justify-between">
      <div className="flex items-center gap-3">
        {driver.photo_url ? (
          <img src={driver.photo_url} alt={driver.name} className="w-12 h-12 rounded-full object-cover" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-aparu-bgGray flex items-center justify-center text-aparu-textMain font-bold text-lg">
            {initials}
          </div>
        )}
        <div className="flex flex-col">
          <span className="font-bold text-aparu-textMain">{driver.car_model}</span>
          <span className="text-aparu-textMuted text-sm">{driver.plate}</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-aparu-textMain font-medium text-sm">{driver.name}</span>
            <div className="flex items-center gap-1 bg-aparu-bgGray px-2 py-0.5 rounded-full">
              <span className="text-yellow-500 text-xs">★</span>
              <span className="text-xs font-medium text-aparu-textMain">{driver.rating.toFixed(1)}</span>
            </div>
          </div>
        </div>
      </div>
      <a
        href={`tel:${driver.phone}`}
        className="flex items-center justify-center w-10 h-10 bg-orange-100 text-aparu-brand rounded-full shrink-0"
        title={t('buttons.call_driver')}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      </a>
    </div>
  )
}
