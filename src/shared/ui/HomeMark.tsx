export function HomeMark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
      <path d="M9 23 24 11l15 12v15H9V23Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M19 38V25h10v13M24 7V3M37 12l3-3M11 12 8 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
