import { Link } from "react-router";
import { ArrowRight, BookOpen, Check, Sparkles, User } from "lucide-react";
import { Button } from "~/components/ui/button";
import { CourseImage } from "~/components/course-image";
import type {
  LandingAction,
  LandingCourse,
} from "~/modules/landing-page/index.server";

const PROMISES = [
  "Self-paced lessons",
  "Quizzes that check you",
  "Progress you can see",
];

export function LandingHero({
  spotlight,
  secondaryAction,
}: {
  spotlight: LandingCourse | null;
  secondaryAction: LandingAction;
}) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 right-[-10rem] size-[36rem] rounded-full bg-primary/5 blur-3xl"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-6 py-20 lg:grid-cols-[1.15fr_1fr] lg:py-28">
        <div>
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" />
            Courses for working developers
          </p>
          <h1 className="text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            Learn to code,
            <br />
            <span className="text-muted-foreground">at your own pace.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Structured courses built by experienced instructors. Track your
            progress, take quizzes, and build real-world skills.
          </p>
          <HeroActions secondaryAction={secondaryAction} />
        </div>
        {spotlight && <SpotlightCard course={spotlight} />}
      </div>
    </section>
  );
}

function HeroActions({ secondaryAction }: { secondaryAction: LandingAction }) {
  return (
    <>
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Button asChild size="lg">
          <Link to="/courses">
            Browse Courses
            <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to={secondaryAction.to}>{secondaryAction.label}</Link>
        </Button>
      </div>
      <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        {PROMISES.map((promise) => (
          <li key={promise} className="flex items-center gap-2">
            <Check className="size-4 text-primary" />
            {promise}
          </li>
        ))}
      </ul>
    </>
  );
}

function SpotlightCard({ course }: { course: LandingCourse }) {
  return (
    <div className="relative mx-auto w-full max-w-md lg:mx-0 lg:justify-self-end">
      <div
        aria-hidden
        className="absolute -inset-3 rotate-3 rounded-2xl border border-border bg-muted/70"
      />
      <Link
        to={`/courses/${course.slug}`}
        className="group relative block overflow-hidden rounded-2xl border border-border bg-card shadow-xl transition-shadow hover:shadow-2xl"
      >
        <CourseImage
          src={course.coverImageUrl}
          alt={course.title}
          className="aspect-video w-full object-cover"
        />
        <div className="p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Newest · {course.categoryName}
          </p>
          <h2 className="mt-2 text-xl font-semibold leading-snug group-hover:text-primary">
            {course.title}
          </h2>
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
            {course.description}
          </p>
          <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="size-3" />
              {course.instructorName}
            </span>
            <span className="flex items-center gap-1">
              <BookOpen className="size-3" />
              {course.lessonCount} lessons
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
