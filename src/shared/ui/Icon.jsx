const iconPaths = {
  arrowLeft: (
    <>
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.4-4.6" />
      <path d="M4 4v5h5" />
      <path d="M4 13a8 8 0 0 0 14.4 4.6" />
      <path d="M20 20v-5h-5" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  settings: (
    <>
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <path d="M5.6 5.6l2.1 2.1" />
      <path d="M16.3 16.3l2.1 2.1" />
      <path d="M18.4 5.6l-2.1 2.1" />
      <path d="M7.7 16.3l-2.1 2.1" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  close: (
    <>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </>
  ),
  check: (
    <>
      <path d="M20 6L9 17l-5-5" />
    </>
  ),
  report: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h8" />
      <path d="M8 9h3" />
    </>
  ),
  pizza: (
    <>
      <path d="M3 3c6-2 12-2 18 0" />
      <path d="M12 21L3 3c6 3 12 3 18 0L12 21z" />
      <circle cx="11" cy="9" r="1" />
      <circle cx="14" cy="12" r="1" />
    </>
  ),
  drink: (
    <>
      <path d="M7 4h10" />
      <path d="M9 4v16h6V4" />
      <path d="M14 2l3 3" />
      <path d="M12 10h4" />
    </>
  ),
  combo: (
    <>
      <rect x="3" y="4" width="8" height="8" rx="1" />
      <rect x="13" y="12" width="8" height="8" rx="1" />
      <path d="M11 8h2" />
      <path d="M13 16h-2" />
    </>
  ),
  box: (
    <>
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 7v10l9 4 9-4V7" />
      <path d="M12 11v10" />
    </>
  )
};

export function Icon({ name, size = 16, className = '', strokeWidth = 2 }) {
  const icon = iconPaths[name] || iconPaths.box;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {icon}
    </svg>
  );
}

