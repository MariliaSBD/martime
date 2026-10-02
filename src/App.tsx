import { Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from '@/state/app';
import { Layout } from '@/components/Layout';
import { CreateProvider } from '@/components/CreateMenu';
import { FlowsProvider } from '@/components/flows';
import { AuthScreen } from '@/screens/AuthScreen';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { registerAllForms } from '@/forms';

registerAllForms();

import Today from '@/screens/Today';
import CalendarScreen from '@/screens/Calendar';
import Tasks from '@/screens/Tasks';
import Goals from '@/screens/Goals';
import Review from '@/screens/Review';
import SettingsScreen from '@/screens/Settings';
import Onboarding from '@/screens/Onboarding';
import TaskDetail from '@/screens/TaskDetail';
import ProjectDetail from '@/screens/ProjectDetail';
import GoalDetail from '@/screens/GoalDetail';
import DecisionDetail from '@/screens/DecisionDetail';
import ReflectionDetail from '@/screens/ReflectionDetail';
import ImportantDateDetail from '@/screens/ImportantDateDetail';
import WeekReview from '@/screens/WeekReview';
import DayReview from '@/screens/DayReview';
import Reorganize from '@/screens/Reorganize';
import SessionDetail from '@/screens/SessionDetail';
import TrainingReport from '@/screens/TrainingReport';

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
