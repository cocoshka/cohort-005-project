import { describe, it, expect } from "vitest";
import { flattenCourseLessons } from "../course.server";
import { calculateGrade } from "../quiz.server";

describe("calculateGrade", () => {
  it.each([
    [1, "A"],
    [0.9, "A"],
    [0.89, "B"],
    [0.8, "B"],
    [0.79, "C"],
    [0.7, "C"],
    [0.69, "D"],
    [0.6, "D"],
    [0.59, "F"],
    [0, "F"],
  ])("grades a score of %s as %s", (score, grade) => {
    expect(calculateGrade(score)).toBe(grade);
  });
});

describe("flattenCourseLessons", () => {
  it("lists every lesson in module order, tagged with its module", () => {
    const course = {
      modules: [
        {
          id: 1,
          title: "Basics",
          lessons: [
            { id: 10, title: "Hello", moduleId: 1 },
            { id: 11, title: "Types", moduleId: 1 },
          ],
        },
        { id: 2, title: "Empty", lessons: [] },
        {
          id: 3,
          title: "Advanced",
          lessons: [{ id: 30, title: "Generics", moduleId: 3 }],
        },
      ],
    };

    expect(flattenCourseLessons(course)).toEqual([
      { id: 10, title: "Hello", moduleId: 1, moduleTitle: "Basics" },
      { id: 11, title: "Types", moduleId: 1, moduleTitle: "Basics" },
      { id: 30, title: "Generics", moduleId: 3, moduleTitle: "Advanced" },
    ]);
  });

  it("returns nothing for a course with no modules", () => {
    expect(flattenCourseLessons({ modules: [] })).toEqual([]);
  });
});
