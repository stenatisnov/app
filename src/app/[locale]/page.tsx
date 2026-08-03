import { MarketingLanding } from "@/components/marketing/MarketingLanding";

// On the `marketing` branch (no auth/dashboard module) the root route is
// always the public landing page. Once merged into a `stena-*` branch this
// file is replaced by a version that renders the member dashboard for
// signed-in users and falls back to <MarketingLanding /> otherwise.
export default function RootPage() {
  return <MarketingLanding />;
}
