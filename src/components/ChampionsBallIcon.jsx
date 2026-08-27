export default function ChampionsBallIcon({ size = 24, className = '' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="25" stroke="currentColor" strokeWidth="2.6" />
      <path d="M32 16.5 39.1 22l-2.7 8.3h-8.8L24.9 22 32 16.5Z" fill="currentColor" />
      <path d="m39.1 22 9.2-1.4 4.2 8.2-6.6 6.5-9.5-5M24.9 22l-9.2-1.4-4.2 8.2 6.6 6.5 9.5-5M18.1 35.3l-1.5 9.2 7.8 5 7.6-5.2M45.9 35.3l1.5 9.2-7.8 5-7.6-5.2M32 44.3v-14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 28.8 7.8 32l4.8 3.5M51.5 28.8l4.7 3.2-4.8 3.5M24.4 49.5 23 55m16.6-5.5L41 55" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity=".72" />
    </svg>
  )
}
