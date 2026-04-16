import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/authStore'

type Step = 'phone' | 'otp'

interface WebLoginProps {
  onSuccess: () => void
}

export default function WebLogin({ onSuccess }: WebLoginProps) {
  const { t } = useTranslation()
  const requestOtp = useAuthStore((s) => s.requestOtp)
  const loginWithOtp = useAuthStore((s) => s.loginWithOtp)

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phone.trim()) return
    setError(null)
    setLoading(true)
    try {
      await requestOtp(phone.trim())
      setStep('otp')
    } catch {
      setError('Ошибка отправки кода. Попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.length !== 6) return
    setError(null)
    setLoading(true)
    try {
      await loginWithOtp(phone.trim(), otp.trim())
      onSuccess()
    } catch {
      setError('Неверный код. Проверьте консоль сервера.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen flex-col bg-white">
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {/* Logo */}
        <div className="mb-2">
          <span className="text-5xl font-extrabold tracking-tight text-aparu-brand">APARU</span>
        </div>
        <p className="text-aparu-textMuted text-sm mb-10 text-center">
          Быстрый заказ такси по QR-коду
        </p>

        {step === 'phone' ? (
          <form onSubmit={handlePhoneSubmit} className="w-full max-w-sm space-y-4">
            <div>
              <label className="block text-sm font-medium text-aparu-textMain mb-1.5">
                Номер телефона
              </label>
              <input
                type="tel"
                inputMode="tel"
                autoFocus
                placeholder="+7 777 000 00 00"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full border border-aparu-border rounded-md px-4 py-3 text-base text-aparu-textMain placeholder:text-aparu-textMuted focus:outline-none focus:border-aparu-brand focus:ring-1 focus:ring-aparu-brand"
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || !phone.trim()}
              className="w-full bg-aparu-brand disabled:opacity-50 text-white font-semibold rounded-md py-4"
            >
              {loading ? 'Отправка…' : 'Получить код'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit} className="w-full max-w-sm space-y-4">
            <p className="text-sm text-aparu-textMuted text-center">
              Введите код из 6 цифр.{' '}
              <span className="text-aparu-border">(Смотрите консоль сервера)</span>
            </p>
            <div>
              <label className="block text-sm font-medium text-aparu-textMain mb-1.5">
                Код подтверждения
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoFocus
                placeholder="• • • • • •"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="w-full border border-aparu-border rounded-md px-4 py-3 text-center text-2xl tracking-widest font-mono focus:outline-none focus:border-aparu-brand focus:ring-1 focus:ring-aparu-brand"
              />
            </div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full bg-aparu-brand disabled:opacity-50 text-white font-semibold rounded-md py-4"
            >
              {loading ? 'Проверка…' : 'Войти'}
            </button>
            <button
              type="button"
              className="w-full text-aparu-textMuted text-sm py-2"
              onClick={() => { setStep('phone'); setOtp(''); setError(null) }}
            >
              Изменить номер
            </button>
          </form>
        )}
      </div>

      <p className="text-center text-xs text-aparu-border pb-6">
        {t('common.version', 'APARU v1.0')}
      </p>
    </div>
  )
}
