// Small hand-authored icon set (simple geometric shapes only, no complex
// path data) so the dashboard doesn't need an icon-library dependency for
// a handful of glyphs. Consistent 20x20 viewBox, stroke-based, inherits color.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function GridIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="2.5" width="6" height="6" rx="1.2" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1.2" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1.2" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1.2" />
    </svg>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2.5 5.5a1 1 0 0 1 1-1H8l1.5 2h7a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="5" width="15" height="11" rx="1.5" />
      <path d="M2.5 8.5h15" />
      <circle cx="14" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8 17.5H4.5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1H8" />
      <path d="M13 14l4-4-4-4" />
      <path d="M17 10H7.5" />
    </svg>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8.5 2.5H17.5V11.5" />
      <path d="M17.5 2.5 9 11" />
      <path d="M14.5 11v5a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10 3.5v13M3.5 10h13" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7.5 4.5 13 10l-5.5 5.5" />
    </svg>
  );
}

export function TrendUpIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 13.5 8 8.5l3 3 6-6" />
      <path d="M13 5.5h4v4" />
    </svg>
  );
}

export function TrendDownIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 6.5 8 11.5l3-3 6 6" />
      <path d="M13 14.5h4v-4" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 5.5V10l3 2" />
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="7.5" cy="7" r="2.7" />
      <path d="M2.5 16.5c0-2.5 2.24-4.5 5-4.5s5 2 5 4.5" />
      <circle cx="14.5" cy="7.5" r="2.1" />
      <path d="M13 12.3c1.98.35 3.5 1.98 3.5 4.2" />
    </svg>
  );
}

export function AlertCircleIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 6.5v4" />
      <circle cx="10" cy="13.5" r="0.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M6.8 10.2l2.1 2.1 4.3-4.6" />
    </svg>
  );
}

export function DocumentIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5.5 2.5h6l3 3v12a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1Z" />
      <path d="M11.5 2.5v3h3" />
      <path d="M7 11h6M7 14h6" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="7" r="3.3" />
      <path d="M3.5 17c0-3.1 2.9-5.5 6.5-5.5s6.5 2.4 6.5 5.5" />
    </svg>
  );
}

export function HistoryIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 10a6.5 6.5 0 1 0 2-4.7" />
      <path d="M2.5 3v3.5H6" />
      <path d="M10 6.5V10l2.5 1.5" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 6h14M3 10h14M3 14h14" />
    </svg>
  );
}

export function XIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 5l10 10M15 5 5 15" />
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
      <path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" />
    </svg>
  );
}
