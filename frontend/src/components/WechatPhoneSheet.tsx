import { useEffect, useState } from 'react'

/** Generates a plausible-looking Chinese mobile number (+86 1xx xxxx xxxx). */
function randomChinesePhone(): string {
  // Chinese mobile prefixes (real carrier prefixes)
  const prefixes = ['130', '131', '132', '133', '134', '135', '136', '137',
    '138', '139', '150', '151', '152', '153', '155', '156', '157', '158',
    '159', '176', '177', '178', '180', '181', '182', '183', '184', '185',
    '186', '187', '188', '189']
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
  const suffix = String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')
  return `+86${prefix}${suffix}`
}

interface WechatPhoneSheetProps {
  /** Called with the (fake) phone number when the user taps «Разрешить». */
  onAllow: (phone: string) => void
  /** Called when the user taps «Запретить». */
  onDeny: () => void
}

/**
 * Visually imitates the native WeChat "Authorize phone number" bottom sheet.
 *
 * The sheet animates up from the bottom, blurs the background, and presents
 * two buttons — «Разрешить» and «Запретить» — styled to match WeChat's
 * design language (green accent, rounded sheet, app icon row).
 *
 * On «Разрешить» a random Chinese phone number is generated and passed to
 * `onAllow`; no real WeChat SDK is involved.
 */
export default function WechatPhoneSheet({ onAllow, onDeny }: WechatPhoneSheetProps) {
  const [visible, setVisible] = useState(false)

  // Animate-in after mount
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const handleAllow = () => {
    const phone = randomChinesePhone()
    onAllow(phone)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onDeny}
    >
      {/* Sheet — stop propagation so clicks inside don't close it */}
      <div
        className="w-full bg-white rounded-t-3xl overflow-hidden"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* App icon row — mimics WeChat permission screen */}
        <div className="flex items-center justify-center gap-5 pt-4 pb-5">
          {/* APARU icon placeholder */}
          <div className="flex flex-col items-center gap-1">
            <div className="w-14 h-14 rounded-2xl bg-yellow-400 flex items-center justify-center text-2xl shadow">
              🚕
            </div>
            <span className="text-xs text-gray-500">APARU</span>
          </div>
          {/* Arrow */}
          <span className="text-gray-400 text-xl">→</span>
          {/* WeChat icon */}
          <div className="flex flex-col items-center gap-1">
            <div className="w-14 h-14 rounded-2xl bg-green-500 flex items-center justify-center shadow">
              <svg viewBox="0 0 40 40" className="w-9 h-9" fill="white">
                <path d="M16 8C9.37 8 4 12.71 4 18.5c0 3.3 1.77 6.24 4.55 8.18L7.5 30l4.14-2.07A13.8 13.8 0 0 0 16 28.5c.34 0 .67-.01 1-.04-.13-.56-.2-1.14-.2-1.73 0-5.24 4.7-9.5 10.5-9.5.3 0 .6.01.9.03C27.37 13.09 22.3 8 16 8z" />
                <path d="M27.5 19c-4.69 0-8.5 3.13-8.5 7s3.81 7 8.5 7c1.1 0 2.16-.18 3.14-.5L34 34l-1-3.5C34.84 28.97 36 27.1 36 25c0-3.87-3.81-6-8.5-6z" />
              </svg>
            </div>
            <span className="text-xs text-gray-500">微信</span>
          </div>
        </div>

        {/* Title & description */}
        <div className="px-6 pb-4 text-center">
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            APARU хочет получить ваш номер телефона
          </h2>
          <p className="text-sm text-gray-500 leading-snug">
            Номер телефона будет использован для связи водителя с вами.
            Ваши данные защищены.
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-100 mx-4" />

        {/* Action buttons */}
        <div className="flex">
          <button
            className="flex-1 py-4 text-center text-sm font-medium text-gray-500 border-r border-gray-100 active:bg-gray-50"
            onClick={onDeny}
          >
            Запретить
          </button>
          <button
            className="flex-1 py-4 text-center text-sm font-semibold active:bg-green-50"
            style={{ color: '#07C160' }}
            onClick={handleAllow}
          >
            Разрешить
          </button>
        </div>

        {/* Safe area bottom padding */}
        <div className="h-safe-bottom bg-white pb-4" />
      </div>
    </div>
  )
}
