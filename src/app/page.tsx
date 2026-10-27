import { Dashboard } from '@/features/projects/Dashboard';
import { ProjectProvider } from '@/lib/project-runtime/ProjectProvider';

// Pagina principală: tabloul de proiecte. Prerandarea produce doar carcasa („se inițializează”); stocarea se
// deschide exclusiv pe client, în efecte (ProjectProvider).
export default function HomePage() {
  return (
    <ProjectProvider>
      <Dashboard />
    </ProjectProvider>
  );
}
