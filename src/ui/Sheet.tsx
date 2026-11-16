import { useEffect, type ReactNode } from 'react'

export function Sheet({ title, onClose, children }: { title?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        {title && <h3 style={{ fontSize: 19, fontWeight: 700, marginBottom: 14, letterSpacing: '-0.01em' }}>{title}</h3>}
        {children}
      </div>
    </div>
  )
}
