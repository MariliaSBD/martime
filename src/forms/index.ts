import { registerForm } from '@/components/CreateMenu';
import { EventForm, TaskForm } from './TaskForm';
import { ProjectForm } from './ProjectForm';
import { ImportantDateForm } from './ImportantDateForm';
import { GoalForm } from './GoalForm';
import { DecisionForm } from './DecisionForm';
import { ReflectionForm } from './ReflectionForm';

export function registerAllForms(): void {
  registerForm('task', TaskForm);
  registerForm('event', EventForm);
  registerForm('project', ProjectForm);
  registerForm('importantDate', ImportantDateForm);
  registerForm('goal', GoalForm);
  registerForm('decision', DecisionForm);
  registerForm('reflection', ReflectionForm);
}
