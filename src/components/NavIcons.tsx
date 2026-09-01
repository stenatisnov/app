/**
 * Small hand-drawn stroke icons for the nav — one shared visual style
 * (20x20, currentColor, 1.6 stroke) instead of pulling in an icon library
 * dependency for a dozen glyphs. `NAV_ICONS`/`ADMIN_ICONS` key by the same
 * strings already used to look up their translations, so callers just do
 * `NAV_ICONS[key]`.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

function DoorIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 3v14M5 3l8 1.5v11L5 17" />
      <circle cx="9.5" cy="10" r="0.6" fill="currentColor" stroke="none" />
    </Base>
  );
}

function CartIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 4h2l1.6 9.2a1.5 1.5 0 0 0 1.5 1.3h6.4a1.5 1.5 0 0 0 1.5-1.2L18 7H6" />
      <circle cx="8.5" cy="17" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="17" r="1" fill="currentColor" stroke="none" />
    </Base>
  );
}

function ShieldIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10 2.5l6 2.2v5c0 4.2-2.6 7.1-6 7.8-3.4-.7-6-3.6-6-7.8v-5z" />
      <path d="M7.3 10l2 2 3.4-4" />
    </Base>
  );
}

function PersonIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="10" cy="7" r="3" />
      <path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    </Base>
  );
}

export function HamburgerIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 6h14M3 10h14M3 14h14" />
    </Base>
  );
}

function LoginIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8 3H4v14h4" />
      <path d="M9 10h9m0 0l-3-3m3 3l-3 3" />
    </Base>
  );
}

function RegisterIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="8" cy="7" r="3" />
      <path d="M2.5 17c0-3 2.5-5 5.5-5" />
      <path d="M14 8h4m-2-2v4" />
    </Base>
  );
}

function LogoutIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3h4v14h-4" />
      <path d="M11 10H2m0 0l3-3m-3 3l3 3" />
    </Base>
  );
}

function UsersIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="7" cy="7" r="2.5" />
      <path d="M2 17c0-2.8 2.2-5 5-5s5 2.2 5 5" />
      <circle cx="15" cy="8" r="2" />
      <path d="M13.5 12c2.3.2 4 2.1 4 5" />
    </Base>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="4" width="14" height="13" rx="1.5" />
      <path d="M3 8h14M7 2v4M13 2v4" />
    </Base>
  );
}

function TagIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M11 3h5v5l-9 9-5-5z" />
      <circle cx="14" cy="6" r="1" fill="currentColor" stroke="none" />
    </Base>
  );
}

function CoinIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5.3v5.4M6.3 9.6c0 .8.7 1.3 1.7 1.3s1.7-.5 1.7-1.2c0-.9-.8-1.1-1.7-1.4-.9-.3-1.7-.5-1.7-1.4 0-.7.7-1.2 1.7-1.2s1.7.5 1.7 1.3" />
      <path d="M12.5 8.3c1.9.4 3.2 1.5 3.2 2.9 0 1.7-2.1 3-4.7 3-1.6 0-3-.5-3.9-1.3" />
    </Base>
  );
}

function CreditCardIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="2.5" y="5" width="15" height="10" rx="1.5" />
      <path d="M2.5 8.5h15" />
      <path d="M5 12h3" />
    </Base>
  );
}

function TicketIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 8a2 2 0 0 0 0 4v3h14v-3a2 2 0 0 1 0-4V5H3z" />
      <path d="M12 5v10" strokeDasharray="2 2" />
    </Base>
  );
}

function ChartIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 17V10M9 17V5M15 17v-8" />
    </Base>
  );
}

function QrIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="3" width="5" height="5" />
      <rect x="12" y="3" width="5" height="5" />
      <rect x="3" y="12" width="5" height="5" />
      <path d="M12 12h2v2h-2zM16 12h1M12 16h1M16 16h1" />
    </Base>
  );
}

function GearIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.5 4.5l-1.4 1.4M5.9 14.1l-1.4 1.4M15.5 15.5l-1.4-1.4M5.9 5.9L4.5 4.5" />
    </Base>
  );
}

function LogsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 5h12M4 10h12M4 15h8" />
    </Base>
  );
}

function DatabaseIcon(props: IconProps) {
  return (
    <Base {...props}>
      <ellipse cx="10" cy="5" rx="6" ry="2.2" />
      <path d="M4 5v10c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V5" />
      <path d="M4 10c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2" />
    </Base>
  );
}

function BookIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 4.5c1.8-.7 4-.7 6 0v11c-2-.7-4.2-.7-6 0z" />
      <path d="M16 4.5c-1.8-.7-4-.7-6 0v11c2-.7 4.2-.7 6 0z" />
    </Base>
  );
}

function NotebookIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4" y="3" width="12" height="14" rx="1.5" />
      <path d="M4 6.5h2M4 10h2M4 13.5h2" />
      <path d="M8.5 6.5h5M8.5 10h5M8.5 13.5h3.5" />
    </Base>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" />
      <circle cx="10" cy="10" r="2.2" />
    </Base>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M2 10s3-5.5 8-5.5c1.5 0 2.8.4 4 1M18 10s-1 1.8-2.7 3.2M6.7 6.8C4 8.2 2 10 2 10s3 5.5 8 5.5c1.3 0 2.5-.3 3.6-.8" />
      <path d="M8.3 8.3a2.2 2.2 0 0 0 3.1 3.1" />
      <path d="M3 3l14 14" />
    </Base>
  );
}

export const NAV_ICONS = {
  dashboard: DoorIcon,
  verifyPass: QrIcon,
  buy: CartIcon,
  account: PersonIcon,
  paymentCheck: CreditCardIcon,
  cash: CoinIcon,
  setPersonType: TagIcon,
  admin: ShieldIcon,
  guideStaff: BookIcon,
  logbook: NotebookIcon,
  login: LoginIcon,
  register: RegisterIcon,
  logout: LogoutIcon,
} as const;

export const ADMIN_ICONS = {
  users: UsersIcon,
  groups: CalendarIcon,
  pricing: TagIcon,
  payments: CreditCardIcon,
  guests: TicketIcon,
  stats: ChartIcon,
  loginQr: QrIcon,
  settings: GearIcon,
  logs: LogsIcon,
  data: DatabaseIcon,
} as const;
