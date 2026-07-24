import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUserId } from '@/lib/auth/session';
import { listProjects } from '@/lib/services/projects';
import { NewProjectForm } from '@/components/projects/new-project-form';

export default async function ProjectsPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login');

  const projects = await listProjects(userId);

  return (
    <div>
      <h1 className="text-xl font-semibold">Projects</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
        Projects group saved items around a goal or topic you're actively working on.
      </p>

      <div className="mt-6">
        <NewProjectForm />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/inbox?project=${encodeURIComponent(project.name)}`}
            className="rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
          >
            <h3 className="font-medium">{project.name}</h3>
            {project.description && (
              <p className="mt-1 text-sm text-gray-600 dark:text-neutral-400">{project.description}</p>
            )}
            <p className="mt-2 text-xs text-gray-400">{project._count.items} items</p>
          </Link>
        ))}
      </div>

      {projects.length === 0 && (
        <p className="mt-8 text-sm text-gray-500 dark:text-neutral-400">
          No projects yet — add one above, or tag a saved item with a project name.
        </p>
      )}
    </div>
  );
}
