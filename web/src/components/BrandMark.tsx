export function BrandMark() {
  return (
    <svg aria-hidden="true" className="brand-mark" focusable="false" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="17" fill="var(--accent)" />
      <path
        d="M16 19v19c0 9 6 15 16 15s16-6 16-15V19"
        stroke="var(--accent-contrast)"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="16" cy="15" r="5" fill="var(--accent-contrast)" />
      <circle cx="48" cy="15" r="5" fill="var(--accent-contrast)" />
      <circle cx="32" cy="36" r="5" fill="var(--accent-contrast)" />
    </svg>
  );
}
