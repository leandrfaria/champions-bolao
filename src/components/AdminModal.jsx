import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function AdminModal({ title, eyebrow, children, onClose, wide = false, footer }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const modalContent = (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.() }}>
      <section className={`admin-modal ${wide ? 'admin-modal-wide' : ''}`.trim()} role="dialog" aria-modal="true" aria-label={title}>
        <header className="admin-modal-header">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar">×</button>
        </header>
        <div className="admin-modal-body">{children}</div>
        {footer && <footer className="admin-modal-footer">{footer}</footer>}
      </section>
    </div>
  )

  if (typeof document === "undefined") return modalContent
  return createPortal(modalContent, document.body)
}
