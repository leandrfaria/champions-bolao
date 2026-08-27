export default function TrophyIcon({ size = 24, className = '' }) {
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
      <path
        d="M21 10h22v10.5c0 8.6-4.5 15.2-11 17.7-6.5-2.5-11-9.1-11-17.7V10Z"
        fill="currentColor"
        opacity=".18"
      />
      <path
        d="M21 10h22v10.5c0 8.6-4.5 15.2-11 17.7-6.5-2.5-11-9.1-11-17.7V10Z"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path
        d="M21 15H13v5.5c0 6.2 3.8 10.8 10.1 12.1M43 15h8v5.5c0 6.2-3.8 10.8-10.1 12.1"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M32 38.5V47" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M24 48h16M20 54h24" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      <path
        d="m32 17 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7L32 17Z"
        fill="currentColor"
      />
    </svg>
  )
}
