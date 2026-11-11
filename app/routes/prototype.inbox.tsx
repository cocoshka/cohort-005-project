// PROTOTYPE — throwaway route for variant B of the notifications inbox
// prototype (branch prototype/notifications-inbox). Never merge to main.
import { useSearchParams } from "react-router";
import { VariantBInboxPage } from "~/components/notifications-prototype/variant-b";

export default function PrototypeInbox() {
  const [params] = useSearchParams();
  return <VariantBInboxPage openId={params.get("open")} />;
}
