import { requireStaffOrAbove } from "@/lib/session";
import { PassVerificationCard } from "@/components/PassVerificationCard";

export default async function VerifyPassPage() {
  await requireStaffOrAbove();
  return <PassVerificationCard />;
}
