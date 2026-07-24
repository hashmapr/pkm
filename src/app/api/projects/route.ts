import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUserId } from '@/lib/auth/session';
import { createProject, listProjects } from '@/lib/services/projects';

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional(),
});

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projects = await listProjects(userId);
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const project = await createProject(userId, parsed.data.name, parsed.data.description);
    return NextResponse.json({ project }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'A project with this name already exists' }, { status: 409 });
  }
}
