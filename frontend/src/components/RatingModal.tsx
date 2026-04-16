import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface RatingModalProps {
  onSubmit: (rating: number, comment: string) => void
  isSubmitting: boolean
  onSkip?: () => void
}

export default function RatingModal({ onSubmit, isSubmitting, onSkip }: RatingModalProps) {
  const { t } = useTranslation()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')

  const handleSubmit = () => {
    if (rating > 0) {
      onSubmit(rating, comment)
    } else if (onSkip) {
      onSkip()
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl border-t border-aparu-border p-6 w-full max-w-md mx-auto">
      <h3 className="text-xl font-bold text-aparu-textMain text-center mb-5">
        {t('completed.rate_driver')}
      </h3>

      <div className="flex justify-center gap-3 mb-6">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            className="focus:outline-none transition-transform active:scale-90"
          >
            <svg
              className={`w-12 h-12 transition-colors duration-200 ${
                star <= rating ? 'text-yellow-400' : 'text-aparu-bgGray'
              }`}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </button>
        ))}
      </div>

      {rating > 0 && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 mb-4">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('completed.comment_placeholder')}
            className="w-full bg-aparu-bgGray border-none rounded-md p-4 focus:outline-none focus:ring-1 focus:ring-aparu-brand min-h-[100px] resize-none text-base text-aparu-textMain placeholder:text-aparu-textMuted"
          />
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className={`w-full font-semibold py-4 rounded-md transition-opacity disabled:opacity-50 ${
          rating > 0
            ? 'bg-aparu-brand text-white'
            : onSkip
              ? 'bg-aparu-bgGray text-aparu-textMuted'
              : 'bg-aparu-brand/30 text-white cursor-not-allowed'
        }`}
      >
        {rating > 0 ? t('buttons.submit') : (onSkip ? t('common.skip') : t('buttons.submit'))}
      </button>
    </div>
  )
}
