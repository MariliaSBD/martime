import type { DateKey } from '@/lib/time';
import type { PaletteId } from '@/lib/colors';

export interface Base {
  id: string;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type TriState = 'yes' | 'no' | 'unset';
export type Effort = 'demanding' | 'routine' | 'unset';
export type EnergyLevel = 'high' | 'medium' | 'low';
export type Classification = 'essential' | 'useful' | 'waste' | 'travel';

export interface Area extends Base {
  name: string;
  /** 1–8, position in the palette */
  color: number;
  order: number;
}

export interface RepeatRule {
  freq: 'daily' | 'weekdays' | 'weekly' | 'monthly';
  /** ISO weekdays (1 = Monday) for 'weekdays' */
  days?: number[];
  /** inclusive end date */
  until?: DateKey | null;
}

export interface HistoryEntry {
  at: string;
  type: 'postpone' | 'deadline';
  from: string | null;
  to: string | null;
  via?: 'reorganize' | 'review' | 'manual';
}

export type TaskStatus = 'pending' | 'done' | 'delegated' | 'refused';
export type EventStatus = 'ontime' | 'late' | 'postponed' | 'cancelled_me' | 'cancelled_other' | 'missed';

export interface Task extends Base {
  kind: 'task' | 'event';
  title: string;
  areaId: string;
  date: DateKey | null;
  plannedStart: string | null; // HH:mm
  plannedEnd: string | null;
  plannedMinutes: number;
  urgent: TriState;
  important: TriState;
  hard: boolean;
  hardReason: string;
  effort: Effort;
  energyBlockId: string | null;
  projectId: string | null;
  critical: boolean;
  goalId: string | null;
  deadline: string | null; // ISO instant
  repeat: RepeatRule | null;
  locationId: string | null;
  travelMinutes: number;
  reminder: boolean;
  notes: string;
  status: TaskStatus;
  delegatedTo: string;
  followUp: DateKey | null;
  completedAt: string | null;
  /** minutes reported when completing without the timer */
  manualMinutes: number | null;
  energyAtDone: EnergyLevel | null;
  history: HistoryEntry[];
  order: number;
  /** set on a materialised occurrence of a repeating task */
  seriesId: string | null;
  occurrenceDate: DateKey | null;
  /** occurrence removed from a series ("apagar só esta") */
  skipped?: boolean;
  /** dates excluded from the series (materialised or deleted occurrences) */
  exceptions?: DateKey[];
  // events
  arrivedAt: string | null;
  eventStatus: EventStatus | null;
  /** generated from an important date's to-do list */
  importantDateId: string | null;
  todoId: string | null;
  /** occurrence of the important date this task belongs to */
  importantOccurrence?: DateKey | null;
  /** set when Reorganizar removed the task from that day's plan */
  reorganizedOn: DateKey | null;
}

export interface Day extends Base {
  date: DateKey;
  startedAt: string;
  endedAt: string | null;
  frozen: { done: number; total: number; pct: number | null } | null;
  feeling: number | null;
  tip: Tip | null;
}

export interface Tip {
  intro: boolean;
  good: { rule: string; values: Record<string, string | number> };
  watch: { rule: string; values: Record<string, string | number> } | null;
  tomorrow: { rule: string; values: Record<string, string | number> };
}

export interface TimeEntry extends Base {
  start: string;
  end: string | null;
  activity: string;
  areaId: string | null;
  classification: Classification;
  taskId: string | null;
  locationId: string | null;
  source: 'timer' | 'free' | 'sleep' | 'travel' | 'manual';
}

export interface LogSession extends Base {
  start: string;
  end: string;
  reminderMinutes: number;
  thieves: { name: string; action: string }[];
}

export interface Place extends Base {
  name: string;
  address: string;
  travelMinutes: number;
  mode: 'walk' | 'transit' | 'car' | 'other';
}

export interface EnergyBlock extends Base {
  name: string;
  start: string;
  end: string;
  level: EnergyLevel;
}

export interface Project extends Base {
  name: string;
  areaId: string;
  startDate: DateKey | null;
  endDate: DateKey | null;
  objective: string;
  status: 'active' | 'done' | 'paused' | 'cancelled';
  resources: { id: string; text: string }[];
  obstacles: { id: string; obstacle: string; plan: string }[];
  diary: { date: DateKey; text: string }[];
}

export interface GoalReview {
  id: string;
  date: DateKey;
  progress: number | null;
  how: string;
  adjust: string;
}

export interface Goal extends Base {
  what: string;
  measure: string;
  realistic: string;
  why: string;
  dueDate: DateKey;
  areaId: string;
  horizon: 'week' | 'month' | 'quarter' | 'year';
  startDate: DateKey;
  parentId: string | null;
  type: 'number' | 'complete' | 'frequency';
  target: number;
  unit: string;
  source: 'tasks' | 'hours' | 'manual';
  manualLog: { date: DateKey; value: number }[];
  manualDone: boolean;
  routineId: string | null;
  freqN: number;
  freqPer: 'week' | 'month';
  status: 'active' | 'done' | 'paused' | 'abandoned';
  statusWhy: string;
  learned: string;
  order: number;
  isMain: boolean;
  mainWhy: string;
  reviews: GoalReview[];
  completedAt: string | null;
}

export interface Decision extends Base {
  text: string;
  areaId: string | null;
  date: DateKey;
  impact: 'low' | 'high';
  reversibility: 'easy' | 'hard';
  approach: 'fast' | 'data' | 'advice';
  minutes: number | null;
  info: string;
  askedWho: string;
  reviewAt: DateKey | null;
  reviewOutcome: 'good' | 'meh' | 'bad' | null;
  reviewLearned: string;
}

export interface Reflection extends Base {
  date: DateKey;
  situation: string;
  type: 'impossible_deadline' | 'late_mistake' | 'help_overloaded' | 'conflicting_request' | 'other';
  context: 'real' | 'roleplay';
  attitude: 'proactive' | 'assertive' | 'passive' | 'reactive' | null;
  did: string;
  reasoning: string;
  outcome: string;
  differently: string;
  feedback: string;
}

export interface WeeklyReview extends Base {
  weekStart: DateKey;
  q1: string;
  q2: string;
  q3: string;
}

export interface ReorgItem {
  id: string;
  taskId: string | null;
  title: string;
  itemType: 'call' | 'colleague' | 'deadline' | 'email' | 'other' | 'task' | 'event';
  minutes: number;
  decision: 'do' | 'postpone' | 'delegate' | 'refuse';
  order: number;
  postponeTo: DateKey | null;
  delegateTo: string;
  followUp: DateKey | null;
}

export interface Reorganization extends Base {
  date: DateKey;
  kind: 'real' | 'simulation';
  availableMinutes: number;
  items: ReorgItem[];
  criteria: string;
  groupFeedback: string;
}

export interface ImportantDate extends Base {
  name: string;
  date: DateKey;
  yearly: boolean;
  areaId: string | null;
  reminders: number[];
  todos: { id: string; text: string; daysBefore: number }[];
}

export type NotificationType =
  | 'start'
  | 'overtime'
  | 'leave'
  | 'deadline'
  | 'importantDate'
  | 'planTomorrow'
  | 'weeklyReview'
  | 'decisionReview'
  | 'eventOutcome'
  | 'session'
  | 'goodMorning'
  | 'goalReview';

export interface Settings extends Base {
  name: string;
  course: string;
  module: string;
  language: 'pt-PT' | 'en';
  palette: PaletteId;
  wakeTarget: string | null;
  sleepTarget: string | null;
  fixedSchedule: boolean;
  notifications: Record<NotificationType, boolean>;
  sessionReminderMinutes: number;
  planTomorrowTime: string;
  lastAreaId: string | null;
  onboarded: boolean;
  energySuggestionShownAt: string | null;
  routineSuggestionsDismissed: Record<string, string>;
  /** set when the user had to answer "available until" in Reorganizar */
  availableUntil?: string | null;
}

export interface TrainingSection {
  sourceIds: string[];
  justification: string;
  feedback: string;
}

export interface TrainingReport extends Base {
  sections: Record<string, TrainingSection>;
}

export interface ScheduledNotification extends Base {
  type: NotificationType | 'test' | 'rested';
  send_at: string;
  title: string;
  body: string;
  url: string;
  status: 'pending' | 'sent' | 'deferred' | 'cancelled';
  key: string;
  released_at?: string | null;
  /** kept from silence and delivered in "Enquanto descansavas" */
  deferrable: boolean;
}

export interface PushSub extends Base {
  endpoint: string;
  p256dh: string;
  auth: string;
  device: string;
}

export interface TableMap {
  areas: Area;
  tasks: Task;
  days: Day;
  timeEntries: TimeEntry;
  sessions: LogSession;
  places: Place;
  energyBlocks: EnergyBlock;
  projects: Project;
  goals: Goal;
  decisions: Decision;
  reflections: Reflection;
  weeklyReviews: WeeklyReview;
  reorganizations: Reorganization;
  importantDates: ImportantDate;
  settings: Settings;
  trainingReports: TrainingReport;
  notifications: ScheduledNotification;
  pushSubs: PushSub;
}

export type TableName = keyof TableMap;

export const TABLES: TableName[] = [
  'areas',
  'tasks',
  'days',
  'timeEntries',
  'sessions',
  'places',
  'energyBlocks',
  'projects',
  'goals',
  'decisions',
  'reflections',
  'weeklyReviews',
  'reorganizations',
  'importantDates',
  'settings',
  'trainingReports',
  'notifications',
  'pushSubs',
];

/** Supabase table name for each local table */
export const REMOTE: Record<TableName, string> = {
  areas: 'areas',
  tasks: 'tasks',
  days: 'days',
  timeEntries: 'time_entries',
  sessions: 'log_sessions',
  places: 'places',
  energyBlocks: 'energy_blocks',
  projects: 'projects',
  goals: 'goals',
  decisions: 'decisions',
  reflections: 'reflections',
  weeklyReviews: 'weekly_reviews',
  reorganizations: 'reorganizations',
  importantDates: 'important_dates',
  settings: 'settings',
  trainingReports: 'training_reports',
  notifications: 'scheduled_notifications',
  pushSubs: 'push_subscriptions',
};
