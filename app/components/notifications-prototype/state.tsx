// PROTOTYPE — throwaway (see data.ts). In-memory Notification state shared by
// every variant. Nothing is persisted; a reload or user switch reseeds.
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import {
  buildSeed,
  randomArrival,
  type ProtoNotification,
  type SeedData,
} from "./data";

export const VARIANTS = ["A", "B", "C"] as const;
export type Variant = (typeof VARIANTS)[number];
export const VARIANT_NAMES: Record<Variant, string> = {
  A: "Sidebar bell + popover",
  B: "Inbox page in the nav",
  C: "Top bar bell + drawer, split by type",
};

interface Ctx {
  variant: Variant;
  setVariant: (v: Variant) => void;
  items: ProtoNotification[];
  unseen: number;
  unread: number;
  markRead: (id: string) => void;
  markUnread: (id: string) => void;
  markAllRead: () => void;
  markAllSeen: () => void;
  simulate: () => ProtoNotification;
  empty: boolean;
  setEmpty: (e: boolean) => void;
  lastArrivalId: string | null;
}

const NotifCtx = createContext<Ctx | null>(null);

export function useProtoNotifications() {
  const c = useContext(NotifCtx);
  if (!c) throw new Error("NotificationsPrototypeProvider missing");
  return c;
}

const STORAGE_KEY = "prototype-notifications-variant";

export function NotificationsPrototypeProvider({
  seed,
  children,
}: {
  seed: SeedData;
  children: React.ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const [stored, setStored] = useState<Variant>("A");
  const fromUrl = params.get("variant") as Variant | null;

  useEffect(() => {
    const s = sessionStorage.getItem(STORAGE_KEY) as Variant | null;
    if (s && VARIANTS.includes(s)) setStored(s);
  }, []);
  useEffect(() => {
    if (fromUrl && VARIANTS.includes(fromUrl)) {
      sessionStorage.setItem(STORAGE_KEY, fromUrl);
      setStored(fromUrl);
    }
  }, [fromUrl]);

  const variant: Variant =
    fromUrl && VARIANTS.includes(fromUrl) ? fromUrl : stored;

  const setVariant = (v: Variant) => {
    sessionStorage.setItem(STORAGE_KEY, v);
    setStored(v);
    const next = new URLSearchParams(params);
    next.set("variant", v);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  const seedKey = `${seed.role}-${seed.isTeamAdmin}-${seed.names.join()}`;
  const [items, setItems] = useState<ProtoNotification[]>(() => buildSeed(seed));
  useEffect(() => setItems(buildSeed(seed)), [seedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [empty, setEmpty] = useState(false);
  const [lastArrivalId, setLastArrivalId] = useState<string | null>(null);

  const visible = empty ? [] : items;

  const value = useMemo<Ctx>(() => {
    const now = () => Date.now();
    return {
      variant,
      setVariant,
      items: [...visible].sort((a, b) => b.createdAt - a.createdAt),
      unseen: visible.filter((x) => !x.seenAt).length,
      unread: visible.filter((x) => !x.readAt).length,
      markRead: (id) =>
        setItems((xs) =>
          xs.map((x) =>
            x.id === id ? { ...x, readAt: x.readAt ?? now(), seenAt: x.seenAt ?? now() } : x
          )
        ),
      markUnread: (id) =>
        setItems((xs) => xs.map((x) => (x.id === id ? { ...x, readAt: null } : x))),
      markAllRead: () =>
        setItems((xs) =>
          xs.map((x) => ({ ...x, readAt: x.readAt ?? now(), seenAt: x.seenAt ?? now() }))
        ),
      markAllSeen: () =>
        setItems((xs) => xs.map((x) => ({ ...x, seenAt: x.seenAt ?? now() }))),
      simulate: () => {
        const n = randomArrival(seed);
        setEmpty(false);
        setItems((xs) => [n, ...xs]);
        setLastArrivalId(n.id);
        return n;
      },
      empty,
      setEmpty,
      lastArrivalId,
    };
  }, [variant, visible, empty, lastArrivalId, seedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return <NotifCtx.Provider value={value}>{children}</NotifCtx.Provider>;
}
