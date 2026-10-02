import { registerForm } from '@/components/CreateMenu';
import { EventForm, TaskForm } from './TaskForm';
import { ProjectForm } from './ProjectForm';
import { ImportantDateForm } from './ImportantDateForm';
import { GoalForm } from './GoalForm';

export function registerAllForms(): void {
  registerForm('task', TaskForm);
  registerForm('event', EventForm);
  registerForm('project', ProjectForm);
  registerForm('importantDate', ImportantDateForm);
  registerForm('goal', GoalForm);
}
