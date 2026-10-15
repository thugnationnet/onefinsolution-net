import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { getUserModelSettings } from '@/app/actions';
import { ModelPreferences } from '@/components/model-preferences';

export const metadata = {
  title: 'Workspace tools',
  robots: { index: false, follow: false },
};

export default async function PluginsPage() {
  const user = await currentUser();
  if (!user) redirect('/sign-in');

  const settings = await getUserModelSettings();

  return (
    <>
      <section className="panel stack">
        <div>
          <h2>Workspace tools</h2>
          <p className="muted">
            Optional Workspace helpers and model preferences for credit-based tasks. Chat module enablement for the
            homepage experience is also available in Settings → Modules.
          </p>
        </div>
        <div className="button-row">
          <Link className="button secondary" href="/">
            Open Settings modules
          </Link>
          <Link className="text-link" href="/workspace">
            Open Workspace
          </Link>
        </div>
      </section>
      <ModelPreferences enabled={settings.enabledModels} />
    </>
  );
}
