import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  FESTIVE_CLASS,
  FESTIVE_STORAGE_KEY,
  festiveChoice,
  festiveThemeScript,
  isFestiveThemeOn,
} from "../index";

const day = (month: number, date: number) =>
  new Date(2026, month - 1, date, 12);

describe("isFestiveThemeOn", () => {
  it.each([
    ["the first of December", day(12, 1)],
    ["Christmas Day", day(12, 25)],
    ["New Year's Eve", day(12, 31)],
    ["New Year's Day", day(1, 1)],
    ["Twelfth Night, the last day", day(1, 6)],
  ])("follows the season on %s", (_, now) => {
    expect(isFestiveThemeOn(null, now)).toBe(true);
  });

  it.each([
    ["the last day of November", day(11, 30)],
    ["the day after the season", day(1, 7)],
    ["the end of January", day(1, 31)],
    ["midsummer", day(7, 1)],
    ["the sixth of a month other than January", day(2, 6)],
  ])("stays plain on %s", (_, now) => {
    expect(isFestiveThemeOn(null, now)).toBe(false);
  });

  it("shows all year when the device chose it", () => {
    expect(isFestiveThemeOn("on", day(7, 1))).toBe(true);
  });

  it("stays off at Christmas when the device turned it off", () => {
    expect(isFestiveThemeOn("off", day(12, 25))).toBe(false);
  });

  it("follows the season for an unknown saved value", () => {
    expect(isFestiveThemeOn("dark", day(12, 25))).toBe(true);
    expect(isFestiveThemeOn("dark", day(7, 1))).toBe(false);
  });
});

describe("festiveChoice", () => {
  it("saves the switch position as a value isFestiveThemeOn reads back", () => {
    expect(isFestiveThemeOn(festiveChoice(true), day(7, 1))).toBe(true);
    expect(isFestiveThemeOn(festiveChoice(false), day(12, 25))).toBe(false);
  });
});

function runScript(stored: string | null, now: Date) {
  const classes = new Set<string>();
  const storage = {
    getItem: (key: string) => (key === FESTIVE_STORAGE_KEY ? stored : null),
  };
  const document = {
    documentElement: {
      classList: { add: (name: string) => classes.add(name) },
    },
  };
  class FixedDate extends Date {
    constructor() {
      super(now.getTime());
    }
  }
  new Function("localStorage", "document", "Date", festiveThemeScript)(
    storage,
    document,
    FixedDate
  );
  return classes;
}

describe("festiveThemeScript", () => {
  it("adds the festive class in the season", () => {
    expect(runScript(null, day(12, 24)).has(FESTIVE_CLASS)).toBe(true);
  });

  it("adds nothing out of season", () => {
    expect(runScript(null, day(11, 24)).size).toBe(0);
  });

  it("honours the device's saved choice", () => {
    expect(runScript("on", day(11, 24)).has(FESTIVE_CLASS)).toBe(true);
    expect(runScript("off", day(12, 24)).size).toBe(0);
  });
});

describe("names shared with the stylesheet and saved devices", () => {
  it("styles the class the script adds", () => {
    const css = readFileSync("app/festive.css", "utf8");
    expect(FESTIVE_CLASS).not.toBe("");
    expect(css).toContain(`:root.${FESTIVE_CLASS}:not(.dark)`);
    expect(css).toContain(`:root.${FESTIVE_CLASS}.dark`);
  });

  it("keeps the storage key that devices already saved their choice under", () => {
    expect(FESTIVE_STORAGE_KEY).toBe("cadence-festive");
  });
});
