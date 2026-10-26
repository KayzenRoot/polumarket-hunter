import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps): IconProps {
  return {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    ...props,
  };
}

export function LogoIcon(props: IconProps) {
  return (
    <svg {...base(props)} viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="11.5" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="3.2" fill="currentColor" stroke="none" />
      <path d="M16 2.5v5M16 24.5v5M2.5 16h5M24.5 16h5" strokeWidth="1.6" />
    </svg>
  );
}

export function OverviewIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="7" height="7" rx="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1.6" />
      <rect x="14" y="14" width="7" height="7" rx="1.6" />
    </svg>
  );
}

export function MarketsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 20V10M9 20V4M15 20v-7M21 20V7" />
    </svg>
  );
}

export function TradesIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7h13M14 4l3 3-3 3" />
      <path d="M20 17H7M10 14l-3 3 3 3" />
    </svg>
  );
}

export function RiskIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3l7 3v5.5c0 4.6-3 8-7 9.5-4-1.5-7-4.9-7-9.5V6l7-3z" />
      <path d="M9.5 12l1.8 1.8 3.4-3.6" />
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 4.8v14.4l11-7.2-11-7.2z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function KillIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v9" />
      <path d="M7.1 6.3a8 8 0 1 0 9.8 0" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20 11a8 8 0 0 0-14.9-3M4 5v4h4" />
      <path d="M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4" />
    </svg>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9M17 12v3M20 12v2" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 4l9 16H3L12 4z" />
      <path d="M12 9v5M12 17.2v.2" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}
