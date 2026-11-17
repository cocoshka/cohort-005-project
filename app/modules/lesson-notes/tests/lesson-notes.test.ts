import { describe, it, expect } from "vitest";
import { describeNoteDraft } from "../index";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

describe("describeNoteDraft", () => {
  it("has nothing to save when there is no note and the box is empty", () => {
    expect(describeNoteDraft(undefined, "")).toEqual({
      length: 0,
      max: MAX_NOTE_LENGTH,
      tooLong: false,
      unsaved: false,
      canSave: false,
    });
  });

  it("cannot save a box of only whitespace", () => {
    const draft = describeNoteDraft(undefined, "   \n ");
    expect(draft.length).toBe(0);
    expect(draft.canSave).toBe(false);
  });

  it("can save new text when there is no note yet", () => {
    const draft = describeNoteDraft(undefined, "Generics click now");
    expect(draft).toMatchObject({ length: 18, unsaved: true, canSave: true });
  });

  it("has nothing to save when the box matches the saved note", () => {
    const draft = describeNoteDraft("Saved text", "Saved text");
    expect(draft).toMatchObject({ unsaved: false, canSave: false });
  });

  it("ignores whitespace at either end, because saving trims it", () => {
    const draft = describeNoteDraft("Saved text", "  Saved text\n");
    expect(draft).toMatchObject({ length: 10, unsaved: false, canSave: false });
  });

  it("can save an edit to the saved note", () => {
    const draft = describeNoteDraft("Saved text", "Saved text, edited");
    expect(draft).toMatchObject({ unsaved: true, canSave: true });
  });

  it("cannot save a cleared box over a saved note, because saving needs text", () => {
    const draft = describeNoteDraft("Saved text", "  ");
    expect(draft).toMatchObject({ length: 0, unsaved: true, canSave: false });
  });

  it("allows a note of exactly the limit", () => {
    const draft = describeNoteDraft(undefined, "a".repeat(MAX_NOTE_LENGTH));
    expect(draft).toMatchObject({ tooLong: false, canSave: true });
  });

  it("refuses a note one character over the limit", () => {
    const draft = describeNoteDraft(undefined, "a".repeat(MAX_NOTE_LENGTH + 1));
    expect(draft).toMatchObject({
      length: MAX_NOTE_LENGTH + 1,
      tooLong: true,
      unsaved: true,
      canSave: false,
    });
  });
});
