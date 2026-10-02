import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from '@/state/app';
import { Layout } from '@/components/Layout';
import { CreateProvider } from '@/components/CreateMenu';
import { FlowsProvider } from '@/components/flows';
import { AuthScreen } from '@/screens/AuthScreen';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { registerAllForms } from '@/forms';

registerAllForms();

const Today = lazy(() => import('@/screens/Today'));
const CalendarScreen = lazy(() => import('@/screens/Calendar'));
const Tasks = lazy(() => import('@/screens/Tasks'));
const Goals = lazy(() => import('@/screens/Goals'));
const Review = lazy(() => import('@/screens/Review'));
const SettingsScreen = lazy(() => import('@/screens/Settings'));
const Onboarding = lazy(() => import('@/screens/Onboarding'));
const TaskDetail = lazy(() => import('@/screens/TaskDetail'));
const ProjectDetail = lazy(() => import('@/screens/ProjectDetail'));
const GoalDetail = lazy(() => import('@/screens/GoalDetail'));
const DecisionDetail = lazy(() => import('@/screens/DecisionDetail'));
const ReflectionDetail = lazy(() => import('@/screens/ReflectionDetail'));
const ImportantDateDetail = lazy(() => import('@/screens/ImportantDateDetail'));
const WeekReview = lazy(() => import('@/screens/WeekReview'));
const DayReview = lazy(() => import('@/screens/DayReview'));
const Reorganize = lazy(() => import('@/screens/Reorganize'));
const SessionDetail = lazy(() => import('@/screens/SessionDetail'));
const TrainingReport = lazy(() => import('@/screens/TrainingReport'));

function Loading() {
  return <div className="p-8" aria-busy="true" />;
}

export default function App() {
  const { ready, session, settings } = useApp();
  if (!ready) return <Loading />;
  if (!session) return <AuthScreen />;
  const needsOnboarding = !settings.onboarded;
  return (
    <HashRouter>
      <ErrorBoundary>
        <FlowsProvider>
        <CreateProvider>
          <Suspense fallback={<Loading />}>
            {needsOnboarding ? (
              <Onboarding />
            ) : (
              <Routes>
                <Route element={<Layout />}>
                  <Route path="/hoje" element={<Today />} />
                  <Route path="/hoje/revisao" element={<DayReview />} />
                  <Route path="/hoje/reorganizar" element={<Reorganize />} />
                  <Route path="/calendario" element={<CalendarScreen />} />
                  <Route path="/tarefas" element={<Tasks />} />
                  <Route path="/tarefa/:id" element={<TaskDetail />} />
                  <Route path="/projeto/:id" element={<ProjectDetail />} />
                  <Route path="/objetivos" element={<Goals />} />
                  <Route path="/objetivo/:id" element={<GoalDetail />} />
                  <Route path="/revisao" element={<Review />} />
                  <Route path="/decisao/:id" element={<DecisionDetail />} />
                  <Route path="/reflexao/:id" element={<ReflectionDetail />} />
                  <Route path="/data/:id" element={<ImportantDateDetail />} />
                  <Route path="/semana/:week" element={<WeekReview />} />
                  <Route path="/sessao/:id" element={<SessionDetail />} />
                  <Route path="/formacao" element={<TrainingReport />} />
                  <Route path="/definicoes" element={<SettingsScreen />} />
                  <Route path="*" element={<Navigate to="/hoje" replace />} />
                </Route>
              </Routes>
            )}
          </Suspense>
        </CreateProvider>
        </FlowsProvider>
      </ErrorBoundary>
    </HashRouter>
  );
}
