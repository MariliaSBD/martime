import { registerForm } from '@/components/CreateMenu';
import { EventForm, TaskForm } from './TaskForm';
import { ProjectForm } from './ProjectForm';

export function registerAllForms(): void {
  registerForm('task', TaskForm);
  registerForm('event', EventForm);
  registerForm('project', ProjectForm);
}
