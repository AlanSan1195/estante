/** Iconos SVG en línea (trazo 1.8, esquinas redondeadas al estilo SF Symbols). */

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const MenuLinesIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 7h14M5 12h14M5 17h9" />
  </Svg>
);

export const ListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <circle cx="4.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="17.5" r="0.9" fill="currentColor" stroke="none" />
  </Svg>
);

export const ReturnIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 010 11H11" />
  </Svg>
);

export const ShareIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M7 11H6a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2v-6a2 2 0 00-2-2h-1" />
  </Svg>
);

export const ScrollModeIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="3" width="14" height="18" rx="2.5" />
    <path d="M8.5 8h7M8.5 12h7M8.5 16h4.5" />
  </Svg>
);

export const ChevronIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);

export const CopyIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8" y="8" width="12" height="12" rx="2.5" />
    <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
  </Svg>
);

export const ResetZoomIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2M8.5 11h5" />
  </Svg>
);

export const BookmarkIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p}>
    <path
      d="M7 3.5h10a1 1 0 011 1V21l-6-4.2L6 21V4.5a1 1 0 011-1z"
      fill={filled ? 'currentColor' : 'none'}
    />
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5L20.5 20.5" />
  </Svg>
);

/** Glosario: libro abierto con "Aa". */
export const GlossaryIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5.5A1.5 1.5 0 015.5 4H11v16H5.5A1.5 1.5 0 014 18.5z" />
    <path d="M20 5.5A1.5 1.5 0 0018.5 4H13v16h5.5a1.5 1.5 0 001.5-1.5z" />
    <path d="M6.5 13l1.6-4.5L9.7 13M7 11.6h2.2" strokeWidth={1.4} />
    <path d="M15 9.5h3M15 12h3M15 14.5h2" strokeWidth={1.4} />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4.5A1.5 1.5 0 0110.5 3h3A1.5 1.5 0 0115 4.5V7" />
  </Svg>
);

export const NoteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4h14a1 1 0 011 1v10l-5 5H5a1 1 0 01-1-1V5a1 1 0 011-1z" />
    <path d="M15 20v-4a1 1 0 011-1h4M8 9h8M8 12.5h5" />
  </Svg>
);

export const HighlighterIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 4.5l5 5L10 19H5v-5z" />
    <path d="M12 7l5 5M4 21h16" />
  </Svg>
);

export const HomeIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p}>
    <path
      d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 01-1.5 1.5H15v-6h-6v6H5.5A1.5 1.5 0 014 19z"
      fill={filled ? 'currentColor' : 'none'}
    />
  </Svg>
);

export const LibraryIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p}>
    <rect x="3.5" y="4" width="4" height="16" rx="1" fill={filled ? 'currentColor' : 'none'} />
    <rect x="9.5" y="6" width="4" height="14" rx="1" fill={filled ? 'currentColor' : 'none'} />
    <path d="M15.6 6.8l3.6-1 3 13.4-3.6 1z" fill={filled ? 'currentColor' : 'none'} />
  </Svg>
);

export const PracticeIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p}>
    <rect x="3" y="6" width="14" height="14" rx="2.5" fill={filled ? 'currentColor' : 'none'} />
    <path d="M7 3.5h11.5A2.5 2.5 0 0121 6v11" />
    <path
      d="M7.5 11a2.5 2.5 0 114 2c-.9.6-1.5 1-1.5 2M10 17.5v.01"
      stroke={filled ? 'var(--tab-ink-inverse, #fff)' : 'currentColor'}
    />
  </Svg>
);

export const MoreIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </Svg>
);

export const SortIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M7 12h10M10 17h4" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

export const RestartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 108-8 8.4 8.4 0 00-6 2.6L4 8.5" />
    <path d="M4 4v4.5h4.5" />
  </Svg>
);

export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.8v.01" />
  </Svg>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

const CLOUD = 'M7.2 18.5h10.3a4 4 0 00.6-7.96A5.6 5.6 0 007.4 9.1a4.7 4.7 0 00-.2 9.4z';

export const CloudIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d={CLOUD} />
  </Svg>
);

export const CloudDownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d={CLOUD} />
    <path d="M12 10.6v5.2M9.8 13.8l2.2 2.1 2.2-2.1" />
  </Svg>
);

export const CloudCheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d={CLOUD} />
    <path d="M9.4 13.9l1.9 1.8 3.4-3.6" />
  </Svg>
);

export const CloudOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 9.2a5.6 5.6 0 019.1 1.34 4 4 0 012.3 6.6M16 18.5H7.2a4.7 4.7 0 01-1.6-9.1" />
    <path d="M3.5 4l17 16" />
  </Svg>
);

export const PlusSquareIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="M12 8.5v7M8.5 12h7" />
  </Svg>
);

export const InstallIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6.5" y="2.8" width="11" height="18.4" rx="2.6" />
    <path d="M12 7.5v6.2M9.6 11.4l2.4 2.4 2.4-2.4M10.5 18h3" />
  </Svg>
);
