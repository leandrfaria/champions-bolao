export default function EmptyState({ title, text, action }) {
  return (
    <div className="empty-state">
      <div className="empty-orbit" aria-hidden="true">✦</div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}
