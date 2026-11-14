import * as schema from "~/db/schema";
import { enrollStudentInTransaction } from "~/lib/enrollments.server";
import type { TestDb } from "./setup";

/** Adds a Student named `name` and returns their id. */
export function addStudent(db: TestDb, name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase().replaceAll(" ", ".")}@example.com`,
      role: schema.UserRole.Student,
    })
    .returning()
    .get().id;
}

/** Records a discounted Purchase made in `country`, then enrolls the user. */
export function buyAndEnroll(
  db: TestDb,
  userId: number,
  courseId: number,
  country: string
) {
  db.insert(schema.purchases)
    .values({ userId, courseId, amountPaid: 2500, country })
    .run();
  const enrolled = enrollStudentInTransaction(db, userId, courseId, new Date());
  if (!enrolled.ok) throw new Error(enrolled.error);
}
