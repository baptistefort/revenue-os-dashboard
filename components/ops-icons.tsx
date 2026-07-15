import type { IconName } from "@/lib/ops-demo-data";

type IconProps = {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

const paths: Record<IconName, React.ReactNode> = {
  grid: <><rect x="3.5" y="3.5" width="6" height="6" rx="1.4" /><rect x="14.5" y="3.5" width="6" height="6" rx="1.4" /><rect x="3.5" y="14.5" width="6" height="6" rx="1.4" /><rect x="14.5" y="14.5" width="6" height="6" rx="1.4" /></>,
  spark: <><path d="M12 2.8c.7 4.8 2.4 6.5 7.2 7.2-4.8.7-6.5 2.4-7.2 7.2-.7-4.8-2.4-6.5-7.2-7.2 4.8-.7 6.5-2.4 7.2-7.2Z" /><path d="M19.2 15.8c.25 1.8.9 2.45 2.7 2.7-1.8.25-2.45.9-2.7 2.7-.25-1.8-.9-2.45-2.7-2.7 1.8-.25 2.45-.9 2.7-2.7Z" /></>,
  cycle: <><path d="M5 7.2h12.5M14.5 3.8l3.4 3.4-3.4 3.4" /><path d="M19 16.8H6.5M9.5 20.2l-3.4-3.4 3.4-3.4" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4.5 7 7.5 6 7.5-6" /></>,
  document: <><path d="M6 2.8h8l4 4V21H6z" /><path d="M14 2.8V7h4M9 11h6M9 15h6M9 18h4" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20c.5-4 2.3-6 5.5-6s5 2 5.5 6" /><path d="M15.5 5.5a3 3 0 0 1 0 5.5M16.5 14c2.6.6 3.8 2.5 4 6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 2.8v4.4M17 2.8v4.4M3 9h18" /><path d="M7 13h3v3H7zM14 13h3" /></>,
  database: <><ellipse cx="12" cy="5.5" rx="8" ry="3" /><path d="M4 5.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6M4 11.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
  chart: <><path d="M3 21h18" /><rect x="5" y="12" width="3" height="6" rx="1" /><rect x="10.5" y="7" width="3" height="11" rx="1" /><rect x="16" y="3" width="3" height="15" rx="1" /></>,
  brain: <><path d="M9 4.2a3.7 3.7 0 0 0-5 4.3A3.8 3.8 0 0 0 4.8 15 3.5 3.5 0 0 0 9 19.8V4.2Z" /><path d="M15 4.2a3.7 3.7 0 0 1 5 4.3 3.8 3.8 0 0 1-.8 6.5 3.5 3.5 0 0 1-4.2 4.8V4.2Z" /><path d="M9 8c-2 0-3-1-3.3-2.2M9 13c-2.4 0-4 .9-4.6 2.1M15 8c2 0 3-1 3.3-2.2M15 13c2.4 0 4 .9 4.6 2.1M12 3v18" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>,
  plus: <path d="M12 4v16M4 12h16" />,
  minus: <path d="M4 12h16" />,
  fit: <><path d="M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5" /><path d="M4 9 9 4M15 4l5 5M20 15l-5 5M9 20l-5-5" /></>,
  chevron: <path d="m8 9 4 4 4-4" />,
  arrow: <><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></>,
  microphone: <><rect x="8" y="3" width="8" height="13" rx="4" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" /></>,
  attach: <path d="m9 13 6.4-6.4a3 3 0 0 1 4.2 4.2l-8.5 8.5a5 5 0 0 1-7.1-7.1L12.5 3.7" />,
  command: <><path d="M9 6.5V17a3.5 3.5 0 1 1-3.5-3.5H18a3.5 3.5 0 1 1-3.5 3.5V6.5A3.5 3.5 0 1 1 18 10H5.5A3.5 3.5 0 1 1 9 6.5Z" /></>,
  check: <path d="m5 12.5 4.2 4.2L19.5 6.5" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  filter: <path d="M3.5 5h17l-6.8 7.3v5.5l-3.4 1.8v-7.3L3.5 5Z" />,
  dots: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  send: <><path d="m4 12 16-8-5.5 16-2.8-6.2L4 12Z" /><path d="m11.7 13.8 3.2-3.2" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M9 7V4h6v3M3 12h18M10 12v2h4v-2" /></>,
  coins: <><ellipse cx="9" cy="7" rx="5.5" ry="2.5" /><path d="M3.5 7v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V7M6 16c.8.7 2.4 1.2 4.2 1.2 3 0 5.5-1.1 5.5-2.5v-4" /><path d="M11 5c.8-.7 2.4-1.2 4.2-1.2 3 0 5.3 1.1 5.3 2.5v8c0 1.3-2 2.3-4.7 2.5" /></>,
  trend: <><path d="M4 18 9 12l4 3 7-9" /><path d="M15 6h5v5" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /></>,
  link: <><path d="M9.5 14.5 14.5 9.5" /><path d="M7.8 17.7 6.3 19.2a3.9 3.9 0 0 1-5.5-5.5l4-4a3.9 3.9 0 0 1 5.5 0" /><path d="m16.2 6.3 1.5-1.5a3.9 3.9 0 0 1 5.5 5.5l-4 4a3.9 3.9 0 0 1-5.5 0" /></>,
  shield: <><path d="M12 3 5 6v5c0 4.7 2.8 8.3 7 10 4.2-1.7 7-5.3 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-5" /></>,
  invoice: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  project: <><path d="M4 8h16v11H4zM8 8V5h8v3" /><path d="M4 12h16M10 12v2h4v-2" /></>,
};

export function OpsIcon({ name, size = 20, strokeWidth = 1.75, className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
