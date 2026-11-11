// PROTOTYPE — throwaway. Answers wayfinder ticket "What do the inbox, bell and
// unread count look like?" (cocoshka/cohort-005-project#10). Lives on the
// `prototype/notifications-inbox` branch only; never merge to main.
//
// Fake, in-memory Notifications built from the real Notification kinds
// (see "Which events produce a Notification, and for whom?", #4).

export type Kind =
  | "refund-request-decided"
  | "new-refund-request"
  | "new-reply"
  | "new-question"
  | "seat-claimed"
  | "announcement";

export interface ProtoNotification {
  id: string;
  kind: Kind;
  title: string; // one line, what happened
  detail?: string; // short secondary line (decision note, comment excerpt…)
  actor: string; // who did it ("Cadence" for system-ish ones)
  actorRole?: string;
  course?: string;
  href: string; // click-through to the source
  // Announcement-only
  scope?: "course" | "everyone";
  body?: string; // Markdown body (shown by variants that render it inline)
  createdAt: number; // ms epoch
  seenAt: number | null; // badge semantics (Knock "seen")
  readAt: number | null; // row semantics (Knock "read")
}

export interface SeedData {
  role: "student" | "instructor" | "admin";
  isTeamAdmin: boolean;
  course: { slug: string; title: string } | null;
  lesson: { id: number; title: string } | null;
  names: string[];
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const KIND_LABEL: Record<Kind, string> = {
  "refund-request-decided": "Refund Request Decided",
  "new-refund-request": "New Refund Request",
  "new-reply": "New Reply",
  "new-question": "New Question",
  "seat-claimed": "Seat Claimed",
  announcement: "Announcement",
};

let counter = 0;
const nid = () => `n${++counter}`;

export function buildSeed(seed: SeedData, now = Date.now()): ProtoNotification[] {
  const course = seed.course ?? { slug: "intro", title: "Intro Course" };
  const lessonHref = seed.lesson
    ? `/courses/${course.slug}/lessons/${seed.lesson.id}`
    : `/courses/${course.slug}`;
  const lessonTitle = seed.lesson?.title ?? "Lesson 1";
  const n = (i: number) => seed.names[i % Math.max(seed.names.length, 1)] ?? "Alex";

  const everyone: ProtoNotification = {
    id: nid(),
    kind: "announcement",
    scope: "everyone",
    title: "Scheduled maintenance on Sunday 02:00–03:00 UTC",
    actor: n(5),
    actorRole: "Platform Admin",
    href: "/announcements",
    body:
      "Cadence will be **read-only** for about an hour while we upgrade the video player.\n\nYour progress is safe. Nothing to do on your side.",
    createdAt: now - 3 * DAY,
    seenAt: now - 2 * DAY,
    readAt: null,
  };

  if (seed.role === "admin") {
    return [
      {
        id: nid(),
        kind: "new-refund-request",
        title: `${n(0)} asked for a refund on ${course.title}`,
        detail: "“The course didn't cover what the description promised.”",
        actor: n(0),
        course: course.title,
        href: "/admin/refunds",
        createdAt: now - 4 * MIN,
        seenAt: null,
        readAt: null,
      },
      {
        id: nid(),
        kind: "new-refund-request",
        title: `${n(1)} asked for a refund on a Team Licence (10 Seats)`,
        detail: "“We bought the wrong course for our team.”",
        actor: n(1),
        course: course.title,
        href: "/admin/refunds",
        createdAt: now - 2 * HOUR,
        seenAt: null,
        readAt: null,
      },
      {
        id: nid(),
        kind: "new-refund-request",
        title: `${n(2)} asked for a refund on ${course.title}`,
        detail: "“Bought it twice by mistake.”",
        actor: n(2),
        course: course.title,
        href: "/admin/refunds",
        createdAt: now - 1 * DAY - 3 * HOUR,
        seenAt: now - DAY,
        readAt: now - DAY,
      },
      { ...everyone, actor: n(6), seenAt: now - 2 * DAY, readAt: now - 2 * DAY },
    ];
  }

  if (seed.role === "instructor") {
    return [
      {
        id: nid(),
        kind: "new-question",
        title: `${n(0)} asked a question on “${lessonTitle}”`,
        detail: "“Why do we need the second useEffect here? Couldn't it be derived?”",
        actor: n(0),
        course: course.title,
        href: lessonHref,
        createdAt: now - 12 * MIN,
        seenAt: null,
        readAt: null,
      },
      {
        id: nid(),
        kind: "new-question",
        title: `${n(1)} asked a question on “${lessonTitle}”`,
        detail: "“The starter repo link 404s for me.”",
        actor: n(1),
        course: course.title,
        href: lessonHref,
        createdAt: now - 50 * MIN,
        seenAt: null,
        readAt: null,
      },
      {
        id: nid(),
        kind: "announcement",
        scope: "course",
        title: `New bonus module coming to ${course.title}`,
        actor: n(5),
        actorRole: "Platform Admin",
        course: course.title,
        href: `/courses/${course.slug}`,
        body:
          "We're adding a **bonus module** on testing next week. Instructors: expect a few questions.",
        createdAt: now - 5 * HOUR,
        seenAt: null,
        readAt: null,
      },
      {
        id: nid(),
        kind: "new-reply",
        title: `${n(2)} replied to your comment on “${lessonTitle}”`,
        detail: "“Thanks, that fixed it!”",
        actor: n(2),
        course: course.title,
        href: lessonHref,
        createdAt: now - 1 * DAY - 2 * HOUR,
        seenAt: now - DAY,
        readAt: now - DAY,
      },
      everyone,
    ];
  }

  // student (optionally a Team Admin)
  const list: ProtoNotification[] = [
    {
      id: nid(),
      kind: "new-reply",
      title: `${n(3)} (Instructor) replied to your comment on “${lessonTitle}”`,
      detail: "“Good catch — I've updated the lesson notes.”",
      actor: n(3),
      actorRole: "Instructor",
      course: course.title,
      href: lessonHref,
      createdAt: now - 6 * MIN,
      seenAt: null,
      readAt: null,
    },
    {
      id: nid(),
      kind: "announcement",
      scope: "course",
      title: "Live Q&A this Thursday at 17:00 UTC",
      actor: n(3),
      actorRole: "Instructor",
      course: course.title,
      href: `/courses/${course.slug}`,
      body:
        "Join me for a **live Q&A** on Thursday.\n\n- Bring questions from modules 2–4\n- Recording will be posted afterwards",
      createdAt: now - 3 * HOUR,
      seenAt: null,
      readAt: null,
    },
    {
      id: nid(),
      kind: "refund-request-decided",
      title: `Your Refund Request for ${course.title} was declined`,
      detail: "Note from Cadence: “You've watched past the Watch Limit (80%).”",
      actor: n(6),
      actorRole: "Platform Admin",
      course: course.title,
      href: `/courses/${course.slug}`,
      createdAt: now - 1 * DAY - 5 * HOUR,
      seenAt: now - DAY,
      readAt: null,
    },
    {
      id: nid(),
      kind: "new-reply",
      title: `${n(4)} replied to your comment on “${lessonTitle}”`,
      detail: "“Same here, the audio cuts out at 3:20.”",
      actor: n(4),
      course: course.title,
      href: lessonHref,
      createdAt: now - 2 * DAY,
      seenAt: now - 2 * DAY,
      readAt: now - 2 * DAY,
    },
    everyone,
  ];
  if (seed.isTeamAdmin) {
    list.splice(1, 0, {
      id: nid(),
      kind: "seat-claimed",
      title: `${n(1)} claimed a Seat on your Team Licence for ${course.title}`,
      detail: "7 of 10 Seats claimed",
      actor: n(1),
      course: course.title,
      href: "/team",
      createdAt: now - 40 * MIN,
      seenAt: null,
      readAt: null,
    });
  }
  return list;
}

/** A fresh Notification for the "Simulate arrival" button. */
export function randomArrival(seed: SeedData, now = Date.now()): ProtoNotification {
  const pool = buildSeed(seed, now).filter((x) => x.kind !== "announcement");
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return { ...pick, id: nid(), createdAt: now, seenAt: null, readAt: null };
}

export function timeAgo(t: number, now = Date.now()) {
  const d = now - t;
  if (d < MIN) return "just now";
  if (d < HOUR) return `${Math.floor(d / MIN)}m`;
  if (d < DAY) return `${Math.floor(d / HOUR)}h`;
  return `${Math.floor(d / DAY)}d`;
}

export function dayBucket(t: number, now = Date.now()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (t >= start.getTime()) return "Today";
  if (t >= start.getTime() - DAY) return "Yesterday";
  return "Earlier";
}
