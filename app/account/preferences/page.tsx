import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { readWorkspacePreferences } from '@/lib/account-service';
import { WorkspacePreferencesForm } from '@/components/workspace-preferences-form';

export const metadata = {
  title: 'Workspace preferences',
  robots: { index: false, follow: false },
};

export default async function AccountPreferencesPage() {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  const preferences = await readWorkspacePreferences(user.id);

  return (
    <section className="panel stack">
      <div>
        <h2>Workspace preferences</h2>
        <p className="muted">Theme, timezone, and editor behavior for this Workspace account.</p>
      </div>
      <WorkspacePreferencesForm settings={preferences} />
    </section>
  );
}
