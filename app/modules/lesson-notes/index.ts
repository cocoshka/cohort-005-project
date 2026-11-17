import { describeDraft, type NoteDraft } from "./lib/draft";

export type { NoteDraft };

/**
 * What the Lesson page's note editor shows about the text in its box: how long
 * it is against the limit, whether it differs from the saved Note, and whether
 * Save would do anything. Whitespace at either end does not count, because
 * saving trims it.
 */
export function describeNoteDraft(
  savedBody: string | undefined,
  draft: string
): NoteDraft {
  return describeDraft(savedBody, draft);
}
