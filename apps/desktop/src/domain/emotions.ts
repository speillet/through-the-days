// The versioned English emotion vocabulary shared with journal-core, plus the
// transparent quadrant rule: 0–4 is low/unpleasant, 6–10 high/pleasant, 5 neutral.

import vocabulary from '../../../../crates/journal-core/assets/emotion-vocabulary.json';

export type EmotionFamilyId = 'unpleasant-high' | 'pleasant-high' | 'unpleasant-low' | 'pleasant-low';

export interface EmotionFamily {
  id: EmotionFamilyId;
  label: string;
}

export interface Emotion {
  id: string;
  label: string;
  family: EmotionFamilyId;
  description: string;
}

const FAMILY_IDS: readonly EmotionFamilyId[] = ['unpleasant-high', 'pleasant-high', 'unpleasant-low', 'pleasant-low'];

function asFamilyId(value: string): EmotionFamilyId {
  if (!(FAMILY_IDS as readonly string[]).includes(value)) {
    throw new Error(`Unknown emotion family in the vocabulary: ${value}`);
  }
  return value as EmotionFamilyId;
}

export const VOCABULARY_VERSION: number = vocabulary.version;

export const EMOTION_FAMILIES: readonly EmotionFamily[] = vocabulary.families.map((family) => ({
  id: asFamilyId(family.id),
  label: family.label,
}));

export const EMOTIONS: readonly Emotion[] = vocabulary.emotions.map((emotion) => ({
  id: emotion.id,
  label: emotion.label,
  family: asFamilyId(emotion.family),
  description: emotion.description,
}));

const BY_ID = new Map(EMOTIONS.map((emotion) => [emotion.id, emotion]));

export function emotionById(id: string): Emotion | undefined {
  return BY_ID.get(id);
}

export function isEmotionId(id: string): boolean {
  return BY_ID.has(id);
}

export function emotionsInFamily(family: EmotionFamilyId): Emotion[] {
  return EMOTIONS.filter((emotion) => emotion.family === family);
}

export function familyById(id: EmotionFamilyId): EmotionFamily {
  const family = EMOTION_FAMILIES.find((candidate) => candidate.id === id);
  if (!family) throw new Error(`Unknown emotion family: ${id}`);
  return family;
}

/**
 * The family suggested by the two scores, or null when either is missing or neutral (5).
 * It is a description of the scores only; a chosen label is never corrected by it.
 */
export function quadrantFor(mood: number | null, energy: number | null): EmotionFamilyId | null {
  if (mood === null || energy === null || mood === 5 || energy === 5) return null;
  const valence = mood > 5 ? 'pleasant' : 'unpleasant';
  const activation = energy > 5 ? 'high' : 'low';
  return `${valence}-${activation}`;
}

/** English reading of a mood score: "Unpleasant", "Neutral" or "Pleasant". */
export function moodZone(mood: number | null): 'Unpleasant' | 'Neutral' | 'Pleasant' | null {
  if (mood === null) return null;
  if (mood === 5) return 'Neutral';
  return mood > 5 ? 'Pleasant' : 'Unpleasant';
}

/** English reading of an energy score: "Lower energy", "Neutral" or "Higher energy". */
export function energyZone(energy: number | null): 'Lower energy' | 'Neutral' | 'Higher energy' | null {
  if (energy === null) return null;
  if (energy === 5) return 'Neutral';
  return energy > 5 ? 'Higher energy' : 'Lower energy';
}
