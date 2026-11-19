import { Link } from "react-router";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, BookOpen, GraduationCap, Users, User } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "~/components/ui/card";
import { CourseImage } from "~/components/course-image";
import type { LandingCourse } from "~/modules/landing-page/index.server";

export function LandingHighlights({
  totalCourses,
  totalCategories,
}: {
  totalCourses: number;
  totalCategories: number;
}) {
  return (
    <section className="border-y border-border bg-muted/50 py-12">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 sm:grid-cols-3">
        <Highlight
          icon={BookOpen}
          value={String(totalCourses)}
          label="Available courses"
        />
        <Highlight
          icon={GraduationCap}
          value={String(totalCategories)}
          label="Topics to explore"
        />
        <Highlight
          icon={Users}
          value="Self-paced"
          label="Learn on your schedule"
        />
      </div>
    </section>
  );
}

function Highlight({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="size-6 text-primary" />
      </div>
      <div>
        <p className="text-2xl font-bold leading-tight">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function FeaturedCourses({ courses }: { courses: LandingCourse[] }) {
  if (courses.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="mb-10 flex items-end justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Featured Courses
          </h2>
          <p className="mt-2 text-muted-foreground">
            Start learning with our most popular courses
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/courses">
            View all
            <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((course) => (
          <FeaturedCourseCard key={course.id} course={course} />
        ))}
      </div>
    </section>
  );
}

function FeaturedCourseCard({ course }: { course: LandingCourse }) {
  return (
    <Link to={`/courses/${course.slug}`} className="group">
      <Card className="h-full overflow-hidden pt-0 transition-shadow group-hover:shadow-md">
        <CourseImage
          src={course.coverImageUrl}
          alt={course.title}
          className="aspect-video w-full object-cover"
        />
        <CardHeader>
          <h3 className="font-semibold leading-snug group-hover:text-primary">
            {course.title}
          </h3>
        </CardHeader>
        <CardContent>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {course.description}
          </p>
        </CardContent>
        <CardFooter className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="size-3" />
            {course.instructorName}
          </span>
          <span className="flex items-center gap-1">
            <BookOpen className="size-3" />
            {course.lessonCount} lessons
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
}

export function LandingFooter({ signedIn }: { signedIn: boolean }) {
  return (
    <footer className="border-t border-border py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-bold tracking-tight">Cadence</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Learn to code, at your own pace.
          </p>
        </div>
        <nav className="flex gap-6 text-sm text-muted-foreground">
          <Link to="/courses" className="hover:text-foreground">
            Courses
          </Link>
          {signedIn ? (
            <Link to="/dashboard" className="hover:text-foreground">
              Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="hover:text-foreground">
                Log In
              </Link>
              <Link to="/signup" className="hover:text-foreground">
                Sign Up
              </Link>
            </>
          )}
        </nav>
      </div>
    </footer>
  );
}
