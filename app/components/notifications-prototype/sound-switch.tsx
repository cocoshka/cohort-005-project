// PROTOTYPE — throwaway (branch prototype/sound-switch). Never merge to main.
// Question (ticket "Where does the sound switch live, and what does it look like?"):
// where does the one account-wide "Play a sound for new Notifications" switch
// live, and what does it look like? Three variants, cycled with ?sound=A|B|C:
//   A  Settings only: a "Notifications" card on /settings with a labelled switch.
//   B  Inbox only: a speaker toggle in the Inbox header. Nothing on Settings.
//   C  Both: the Settings card (canonical) plus a quiet "Sound on/off" line in the
//      Inbox header that links to it.
// The value is in memory only (stands in for the account column), on by default.
// "+ Simulate arrival" plays the chime when sound is on and the tab is visible.
import { createContext, useContext, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Bell, Volume2, VolumeX } from "lucide-react";
import { cn } from "~/lib/utils";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { PrototypeSwitcher } from "~/components/prototype-switcher";
import { useProtoNotifications } from "./state";

export const SOUND_VARIANTS = ["A", "B", "C"] as const;
export type SoundVariant = (typeof SOUND_VARIANTS)[number];
export const SOUND_VARIANT_NAMES: Record<SoundVariant, string> = {
  A: "Settings page only",
  B: "Inbox header toggle only",
  C: "Settings + Inbox shortcut",
};

const LABEL = "Play a sound for new Notifications";

interface SoundCtx {
  variant: SoundVariant;
  setVariant: (v: SoundVariant) => void;
  soundOn: boolean;
  setSoundOn: (on: boolean) => void;
  lastChime: string | null;
}
const Ctx = createContext<SoundCtx | null>(null);
export function useSound() {
  const c = useContext(Ctx);
  if (!c) throw new Error("SoundPrototypeProvider missing");
  return c;
}

let audio: AudioContext | null = null;
export function playChime() {
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    for (const [i, f] of [880, 1320].entries()) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.09);
      g.gain.linearRampToValueAtTime(0.12, t + i * 0.09 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.35);
      o.connect(g).connect(audio.destination);
      o.start(t + i * 0.09);
      o.stop(t + i * 0.09 + 0.4);
    }
  } catch {
    // blocked: skipped silently, as decided
  }
}

export function SoundPrototypeProvider({ children }: { children: React.ReactNode }) {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("sound") as SoundVariant | null;
  const [stored, setStored] = useState<SoundVariant>("A");
  useEffect(() => {
    const s = sessionStorage.getItem("prototype-sound-variant") as SoundVariant | null;
    if (s && SOUND_VARIANTS.includes(s)) setStored(s);
  }, []);
  const variant = fromUrl && SOUND_VARIANTS.includes(fromUrl) ? fromUrl : stored;
  const setVariant = (v: SoundVariant) => {
    sessionStorage.setItem("prototype-sound-variant", v);
    setStored(v);
    const next = new URLSearchParams(params);
    next.set("sound", v);
    setParams(next, { replace: true, preventScrollReset: true });
  };
  const [soundOn, setSoundOn] = useState(true);
  const [lastChime, setLastChime] = useState<string | null>(null);

  // Chime on live arrival (visible tab only).
  const { lastArrivalId } = useProtoNotifications();
  useEffect(() => {
    if (!lastArrivalId) return;
    if (soundOn && document.visibilityState === "visible") {
      playChime();
      setLastChime(new Date().toLocaleTimeString());
    } else {
      setLastChime("skipped (off)");
    }
  }, [lastArrivalId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Ctx.Provider value={{ variant, setVariant, soundOn, setSoundOn, lastChime }}>
      {children}
    </Ctx.Provider>
  );
}

export function SoundSwitcherBar() {
  const { variant, setVariant, soundOn, lastChime } = useSound();
  const { simulate, unread } = useProtoNotifications();
  return (
    <PrototypeSwitcher
      variants={SOUND_VARIANTS}
      current={variant}
      names={SOUND_VARIANT_NAMES}
      onChange={setVariant}
    >
      <button
        onClick={() => simulate()}
        className="rounded-full bg-fuchsia-600 px-2.5 py-1 font-medium hover:bg-fuchsia-500"
      >
        + Simulate arrival
      </button>
      <Link to="/settings" className="underline">Settings</Link>
      <Link to="/prototype/inbox" className="underline">Inbox</Link>
      <span className="font-mono text-white/70">
        sound {soundOn ? "on" : "off"} · unread {unread} · last chime {lastChime ?? "—"}
      </span>
    </PrototypeSwitcher>
  );
}

function Switch({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted-foreground/30"
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-background shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

/** Variants A and C: a Notifications card on /settings, under Profile. */
export function SettingsSoundCard() {
  const { variant, soundOn, setSoundOn } = useSound();
  if (variant === "B") return null;
  return (
    <Card id="notifications" className="mt-8 max-w-md scroll-mt-6">
      <CardHeader>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Bell className="size-4" /> Notifications
        </h2>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-4">
          <div>
            <label htmlFor="sound-switch" className="text-sm font-medium">
              {LABEL}
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              A short chime while Cadence is open in a visible tab.
            </p>
            <button
              onClick={playChime}
              className="mt-2 text-xs font-medium text-primary hover:underline"
            >
              Play a test sound
            </button>
          </div>
          <Switch id="sound-switch" checked={soundOn} onChange={setSoundOn} />
        </div>
      </CardContent>
    </Card>
  );
}

/** Variants B and C: what sits in the Inbox header, left of "Mark all as read". */
export function InboxSoundControl() {
  const { variant, soundOn, setSoundOn } = useSound();
  if (variant === "A") return null;
  if (variant === "B") {
    const Icon = soundOn ? Volume2 : VolumeX;
    return (
      <button
        onClick={() => setSoundOn(!soundOn)}
        aria-pressed={soundOn}
        title={soundOn ? `${LABEL}: on. Click to turn off.` : `${LABEL}: off. Click to turn on.`}
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm hover:bg-accent",
          !soundOn && "text-muted-foreground"
        )}
      >
        <Icon className="size-4" />
        {soundOn ? "Sound on" : "Sound off"}
      </button>
    );
  }
  return (
    <Link
      to="/settings#notifications"
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
    >
      {soundOn ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
      Sound {soundOn ? "on" : "off"} · Change in Settings
    </Link>
  );
}
