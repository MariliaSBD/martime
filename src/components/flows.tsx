import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Scope } from '@/lib/domain/recurrence';
import { isVirtualId } from '@/lib/domain/recurrence';
import { completeTask, deleteTask, applyScope, hasTimer, setEnergy, startTask } from '@/state/actions/tasks';
import { undoable } from '@/db/repo';
import { db } from '@/db/db';
import type { EnergyLevel, Task } from '@/db/types';
import { Button, Field, Input, Sheet, useToast } from './ui';
import { QUICK_DURATIONS } from './fields';

interface Flows {
  complete: (t: Pick<Task, 'id' | 'title' | 'plannedMinutes'>) => Promise<void>;
  start: (t: Pick<Task, 'id' | 'title'>) => Promise<void>;
  remove: (t: Pick<Task, 'id' | 'seriesId' | 'repeat'>) => Promise<void>;
  askScope: () => Promise<Scope | null>;
}

const Ctx = createContext<Flows | null>(null);
export const useFlows = () => useContext(Ctx)!;

export function isRecurring(t: Pick<Task, 'id' | 'seriesId' | 'repeat'>): boolean {
  return isVirtualId(t.id) || !!t.seriesId;
}

export function FlowsProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [ask, setAsk] = useState<{ title: string; planned: number } | null>(null);
  const [minutes, setMinutes] = useState(30);
  const askResolve = useRef<(v: number | null | undefined) => void>(() => {});
  const [energyFor, setEnergyFor] = useState<string | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const scopeResolve = useRef<(s: Scope | null) => void>(() => {});

  const askScope = useCallback(
    () =>
      new Promise<Scope | null>((res) => {
        scopeResolve.current = res;
        setScopeOpen(true);
      }),
    [],
  );

  const complete = useCallback(
    async (task: Pick<Task, 'id' | 'title' | 'plannedMinutes'>) => {
      let manual: number | null | undefined = null;
      if (!(await hasTimer(task.id))) {
        // H8: completing without starting asks how long it took
        setMinutes(task.plannedMinutes || 30);
        manual = await new Promise<number | null | undefined>((res) => {
          askResolve.current = res;
          setAsk({ title: task.title, planned: task.plannedMinutes || 30 });
        });
        setAsk(null);
        if (manual === undefined) return; // cancelled
      }
      const r = await completeTask(task.id, { manualMinutes: manual });
      toast(t('today.completed', { name: task.title }), r.undo);
      if (r.task) setEnergyFor(r.task.id);
    },
    [t, toast],
  );

  const start = useCallback(
    async (task: Pick<Task, 'id' | 'title'>) => {
      const r = await startTask(task.id);
      if (r.paused) toast(t('today.pausedName', { name: r.paused }), r.undo);
    },
    [t, toast],
  );

  const remove = useCallback(
    async (task: Pick<Task, 'id' | 'seriesId' | 'repeat'>) => {
      if (isRecurring(task)) {
        const scope = await askScope();
        if (!scope) return;
        const { undo } = await undoable(() => applyScope(task.id, scope, { kind: 'delete' }));
        toast(t('common.deleted'), undo);
        return;
      }
      const undo = await deleteTask(task.id);
      toast(t('common.deleted'), undo);
    },
    [askScope, t, toast],
  );

  const pickEnergy = async (lvl: EnergyLevel | null) => {
    if (energyFor && lvl) await setEnergy(energyFor, lvl);
    setEnergyFor(null);
  };

  return (
    <Ctx.Provider value={{ complete, start, remove, askScope }}>
      {children}
      <Sheet
        open={!!ask}
        onClose={() => askResolve.current(undefined)}
        title={t('today.howLong')}
        footer={
          <>
            <Button onClick={() => askResolve.current(null)}>{t('today.dontLog')}</Button>
            <Button variant="primary" className="flex-1" onClick={() => askResolve.current(minutes)}>
              {t('common.done')}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-base font-semibold">{ask?.title}</p>
        <div className="mb-3 flex flex-wrap gap-1">
          {[...new Set([ask?.planned ?? 30, ...QUICK_DURATIONS])].map((m) => (
            <Button key={m} variant={minutes === m ? 'soft' : 'secondary'} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>
              {t('common.min', { n: m })}
            </Button>
          ))}
        </div>
        <Field label={t('fields.customMinutes')}>{(id) => <Input id={id} type="number" inputMode="numeric" min={1} value={String(minutes)} onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))} />}</Field>
      </Sheet>
      <Sheet open={!!energyFor} onClose={() => pickEnergy(null)} title={t('today.energyNow')} footer={<Button onClick={() => pickEnergy(null)}>{t('common.skip')}</Button>}>
        <div className="grid grid-cols-3 gap-2">
          {(['low', 'medium', 'high'] as EnergyLevel[]).map((l) => (
            <Button key={l} variant="soft" className="min-h-14" onClick={() => pickEnergy(l)}>
              {t(`energy.${l}`)}
            </Button>
          ))}
        </div>
      </Sheet>
      <Sheet
        open={scopeOpen}
        onClose={() => {
          setScopeOpen(false);
          scopeResolve.current(null);
        }}
        title={t('repeat.which')}
      >
        <div className="flex flex-col gap-2">
          {(['this', 'following', 'all'] as Scope[]).map((s) => (
            <Button
              key={s}
              variant="secondary"
              className="justify-start"
              onClick={() => {
                setScopeOpen(false);
                scopeResolve.current(s);
              }}
            >
              {t(`repeat.scope.${s}`)}
            </Button>
          ))}
        </div>
      </Sheet>
    </Ctx.Provider>
  );
}

/** Live list of timer entries, used by cards. */
export async function loadEntries() {
  return (await db.timeEntries.toArray()).filter((e) => !e.deleted_at);
}
