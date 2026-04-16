/**
 * ToastContainer — renders auto-dismissing notification banners.
 * Driven by useToastStore; place once near the root of the app.
 */

import { useToastStore } from '../../stores/toastStore'

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={[
            'flex items-start gap-3 rounded-xl px-4 py-3 shadow-lg text-sm font-medium pointer-events-auto',
            toast.type === 'error'   ? 'bg-red-500 text-white'   :
            toast.type === 'success' ? 'bg-green-500 text-white' :
                                       'bg-gray-800 text-white',
          ].join(' ')}
        >
          <span className="flex-1 leading-snug">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="shrink-0 text-white/70 hover:text-white text-lg leading-none mt-0.5"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
