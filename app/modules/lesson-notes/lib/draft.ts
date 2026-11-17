import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteDraft = {
  length: number;
  max: number;
  tooLong: boolean;
  unsaved: boolean;
  canSave: boolean;
};

export function describeDraft(
  savedBody: string | undefined,
  draft: string
): NoteDraft {
  const trimmed = draft.trim();
  const tooLong = trimmed.length > MAX_NOTE_LENGTH;
  const unsaved = trimmed !== (savedBody ?? "");
  return {
    length: trimmed.length,
    max: MAX_NOTE_LENGTH,
    tooLong,
    unsaved,
    canSave: unsaved && trimmed.length > 0 && !tooLong,
  };
}
