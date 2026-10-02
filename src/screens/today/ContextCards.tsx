import type { Day } from '@/db/types';
import type { DayData } from './useToday';

/** Contextual cards added in phase 7 (rested reminders, energy and routine suggestions). */
export function ContextCards(_: { data: DayData; now: string; active: Day | undefined }) {
  return null;
}
