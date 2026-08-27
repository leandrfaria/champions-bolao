export default function AdminModal({ title, eyebrow, children, onClose, wide = false, footer }) {
  return (
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
}
