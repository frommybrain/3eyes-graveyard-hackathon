'use client'

import { useToastStore } from '../state/useToastStore'

const typeStyles = {
  success: 'bg-green-900/90 border-green-700 text-green-100',
  error: 'bg-red-900/90 border-red-700 text-red-100',
  info: 'bg-zinc-800/90 border-zinc-600 text-zinc-100',
}

const typeIcons = {
  success: '\u2713',
  error: '\u2717',
  info: '\u2139',
}

export default function Toasts() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-20 left-4 z-[60] flex flex-col-reverse gap-2 pointer-events-none max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 shadow-lg backdrop-blur-sm animate-slide-in ${typeStyles[t.type] || typeStyles.info}`}
          onClick={() => removeToast(t.id)}
        >
          <span className="text-sm font-bold mt-0.5 shrink-0">{typeIcons[t.type]}</span>
          <span className="text-sm leading-snug">{t.message}</span>
        </div>
      ))}
    </div>
  )
}
