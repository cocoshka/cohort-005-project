// PROTOTYPE — throwaway (see data.ts). Floating bar: variant switcher plus the
// controls needed to judge it (simulate an arrival, empty state) and a readout
// of the state.
import { PrototypeSwitcher } from "~/components/prototype-switcher";
import { useProtoNotifications, VARIANTS, VARIANT_NAMES } from "./state";

export function NotificationsSwitcherBar() {
  const { variant, setVariant, simulate, empty, setEmpty, items, unread, unseen } =
    useProtoNotifications();
  return (
    <PrototypeSwitcher
      variants={VARIANTS}
      current={variant}
      names={VARIANT_NAMES}
      onChange={setVariant}
    >
      <button
        onClick={() => simulate()}
        className="rounded-full bg-fuchsia-600 px-2.5 py-1 font-medium hover:bg-fuchsia-500"
      >
        + Simulate arrival
      </button>
      <label className="flex cursor-pointer items-center gap-1">
        <input type="checkbox" checked={empty} onChange={(e) => setEmpty(e.target.checked)} />
        Empty
      </label>
      <span className="font-mono text-white/70">
        total {items.length} · unread {unread} · unseen {unseen}
      </span>
    </PrototypeSwitcher>
  );
}
