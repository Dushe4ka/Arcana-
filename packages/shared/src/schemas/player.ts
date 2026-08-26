import { z } from "zod";

export const createSaveSlotSchema = z.object({
  storyId: z.string().uuid(),
  slotIndex: z.number().int().min(1).max(3),
});
export type CreateSaveSlotInput = z.infer<typeof createSaveSlotSchema>;

/** saveSlotId is taken from the URL (/play/save-slots/:id/choice), not repeated in the body. */
export const submitChoiceSchema = z.object({
  choiceOptionId: z.string().uuid(),
});
export type SubmitChoiceInput = z.infer<typeof submitChoiceSchema>;

/** chapterId is taken from the URL (/play/chapters/:id/start). */
export const startChapterSchema = z.object({
  slotIndex: z.number().int().min(1).max(3).default(1),
});
export type StartChapterInput = z.infer<typeof startChapterSchema>;

export const MAX_SAVE_SLOTS = 3;
