import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';

export const metadata = {
  title: 'Security',
  robots: { index: false, follow: false },
};

export default async function SecurityPage() {
  const user = await currentUser();
  if (!user) redirect('/sign-in');

  return (
    <section className="panel stack">
      <div>
        <h2>Password & security</h2>
        <p className="muted">
          Password changes and account security controls are managed in the Settings popup on the main chat screen
          (Profile → Settings → Account → Password & security).
        </p>
      </div>
      <ul className="data-list">
        <li>
          <div>
            <strong>Change password</strong>
            <small>Requires your current password. Other sessions are signed out after a successful update.</small>
          </div>
        </li>
        <li>
          <div>
            <strong>Payment methods</strong>
            <small>Add, remove, or set a default card from the same Settings popup Account tab.</small>
          </div>
        </li>
      </ul>
      <div className="button-row">
        <Link className="button" href="/">
          Open chat & Settings
        </Link>
        <Link className="button secondary" href="/account">
          Back to Workspace setup
        </Link>
        <Link className="text-link" href="/support">
          Contact support
        </Link>
      </div>
    </section>
  );
}
