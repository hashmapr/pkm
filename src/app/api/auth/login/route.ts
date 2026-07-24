import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';
import { setSessionCookie } from '@/lib/auth/session';
import { loginSchema } from '@/lib/validation/auth';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const user = await db.user.findUnique({ where: { email } });
  const invalidCredentials = () =>
    NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });

  if (!user) return invalidCredentials();

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return invalidCredentials();

  await setSessionCookie(user.id);

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
  });
}
