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

export const CUSTOM_ACTION_CATEGORY = '';
