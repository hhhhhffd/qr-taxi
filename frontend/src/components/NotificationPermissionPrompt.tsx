import { useTranslation } from 'react-i18next'

interface NotificationPermissionPromptProps {
  onAllow: () => Promise<void>
  onLater: () => void
  isRequesting: boolean
}

export default function NotificationPermissionPrompt({
  onAllow,
  onLater,
  isRequesting,
}: NotificationPermissionPromptProps) {
  const { t } = useTranslation()

  return (
    <div className="fixed left-4 right-4 bottom-4 z-[140] pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-aparu-border bg-white p-4 shadow-2xl">
        <h3 className="text-base font-bold text-aparu-textMain">
          {t('notifications.permission_title')}
        </h3>
        <p className="mt-1 text-sm text-aparu-textMuted">
          {t('notifications.permission_subtitle')}
        </p>

        <div className="mt-3 flex gap-2">
          <button
            onClick={() => { void onAllow() }}
            disabled={isRequesting}
            className="flex-1 rounded-md bg-aparu-brand py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {t('notifications.permission_allow')}
          </button>
          <button
            onClick={onLater}
            className="rounded-md border border-aparu-border px-4 py-2.5 text-sm font-medium text-aparu-textMuted"
          >
            {t('notifications.permission_later')}
          </button>
        </div>
      </div>
    </div>
  )
}
