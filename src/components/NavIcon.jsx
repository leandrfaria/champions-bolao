const paths = {
  home: <><path d="M3 10.7 12 3l9 7.7"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-6h5v6"/></>,
  rounds: <><path d="M4 5h16v14H4z"/><path d="M8 5v14M16 5v14"/></>,
  predictions: <><path d="m5 12 4 4L19 6"/><path d="M4 4h16v16H4z"/></>,
  leaderboard: <><path d="M7 20V10h4v10M13 20V4h4v16M3 20h18"/><path d="M5 10h4M15 4h4"/></>,
  activity: <><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
  admin: <><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7-.7-1.7.9-1.9-2.1-2.1-1.9.9-1.7-.7L10.5 2h-3l-.7 2-1.7.7-1.9-.9-2.1 2.1.9 1.9-.7 1.7-2 .7v3l2 .7.7 1.7-.9 1.9 2.1 2.1 1.9-.9 1.7.7.7 2h3l.7-2 1.7-.7 1.9.9 2.1-2.1-.9-1.9.7-1.7z"/></>,
  logout: <><path d="M10 5H4v14h6"/><path d="m14 8 4 4-4 4M18 12H8"/></>,
  collapse: <><path d="m14.5 6-6 6 6 6"/><path d="M20 4v16"/></>,
  expand: <><path d="m9.5 6 6 6-6 6"/><path d="M4 4v16"/></>,
  more: <><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></>,
}

export default function NavIcon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.info}
    </svg>
  )
}
