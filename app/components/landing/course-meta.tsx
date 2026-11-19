import { BookOpen, User } from "lucide-react";
import type { LandingCourse } from "~/modules/landing-page/index.server";

export function CourseMeta({ course }: { course: LandingCourse }) {
  return (
    <>
      <span className="flex items-center gap-1">
        <User className="size-3" />
        {course.instructorName}
      </span>
      <span className="flex items-center gap-1">
        <BookOpen className="size-3" />
        {course.lessonCount} lessons
      </span>
    </>
  );
}
