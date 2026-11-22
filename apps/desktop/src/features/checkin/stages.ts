// The guided check-in, in order (README §4.2 and §14.1). Morning looks ahead;
// Evening looks back. A stage made only of scores is left out while scores are
// hidden (Gentle view or the Show scores preference). An intention written in the
// Morning stays reachable in the Evening, for example after the entry was moved.

import type { Slot } from '../../api/types';

export type StageId = 'feeling' | 'intention' | 'actions' | 'wins' | 'progress' | 'reflect' | 'difficult';

export interface Stage {
  id: StageId;
  title: string;
}

export interface StageOptions {
  /** The entry has an intention to show, whatever its slot. */
  intention?: boolean;
}

const INTENTION: Stage = { id: 'intention', title: "Today's intention" };

export function checkInStages(slot: Slot, showScores: boolean, { intention = false }: StageOptions = {}): Stage[] {
  const looking: Stage[] =
    slot === 'morning'
      ? [INTENTION]
      : [...(intention ? [INTENTION] : []), { id: 'actions', title: 'What I did' }];
  const stages: Stage[] = [
    { id: 'feeling', title: 'How am I feeling?' },
    ...looking,
    { id: 'wins', title: 'Small wins and pride' },
    { id: 'progress', title: 'Moving forward' },
    { id: 'reflect', title: 'What helped' },
    { id: 'difficult', title: slot === 'morning' ? 'Difficulties' : 'Difficulties and next step' },
  ];
  return showScores ? stages : stages.filter((stage) => stage.id !== 'progress');
}
