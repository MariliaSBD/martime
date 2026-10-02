import { registerForm } from '@/components/CreateMenu';
import { EventForm, TaskForm } from './TaskForm';

export function registerAllForms(): void {
  registerForm('task', TaskForm);
  registerForm('event', EventForm);
}
