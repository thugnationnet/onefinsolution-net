import { currentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import styles from './account-hub.module.css';

export const metadata = {
  title: 'Account Settings',
  robots: { index: false, follow: false },
};

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/sign-in?next=%2Faccount');

  return (
    <div className="page-wrap">
      <header className={styles.pageHeader}>
        <div>
          <p className="eyebrow">ONE FIN ACCOUNT</p>
          <h1>Account Settings</h1>
          <p className="muted">Security, activity, billing, and an overview of your One Fin products.</p>
        </div>
        <Link className={`button secondary ${styles.headerAction}`} href="/">Open Home Page Chat Plus</Link>
      </header>
      {children}
    </div>
  );
}
