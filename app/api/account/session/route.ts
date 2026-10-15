import { currentUser } from '@/lib/session';
import { readPreferences } from '@/lib/account-service';
import { defaultPreferences } from '@/lib/account-preferences';

export async function GET() {
  try {
    const user = await currentUser();
    const preferences = user ? await readPreferences(user.id) : defaultPreferences;
    return Response.json(
      {
        isAuthenticated: Boolean(user),
        preferences,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return Response.json(
      {
        isAuthenticated: false,
        preferences: defaultPreferences,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
