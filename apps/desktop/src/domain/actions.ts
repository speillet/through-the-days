// Preset categories for reported actions. A custom action uses the category ''.

export const ACTION_CATEGORIES = [
  { id: 'work', label: 'Work' },
  { id: 'walking', label: 'Walking' },
  { id: 'exercise', label: 'Exercise' },
  { id: 'reading', label: 'Reading' },
  { id: 'social', label: 'Social' },
  { id: 'rest', label: 'Rest' },
  { id: 'creative', label: 'Creative' },
  { id: 'self-care', label: 'Self-care' },
  { id: 'other', label: 'Other' },
] as const;

export type ActionCategoryId = (typeof ACTION_CATEGORIES)[number]['id'];

export const CUSTOM_ACTION_CATEGORY = '';

export function isActionCategory(id: string): id is ActionCategoryId {
  return ACTION_CATEGORIES.some((category) => category.id === id);
}

/** English label of a preset category, or null for a custom action. */
export function actionCategoryLabel(id: string): string | null {
  return ACTION_CATEGORIES.find((category) => category.id === id)?.label ?? null;
}
