import { currentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
export const metadata={title:'Dashboard',robots:{index:false,follow:false}};
export default async function DashboardLayout({children}:{children:React.ReactNode}) {
  if(!await currentUser()) redirect('/sign-in');
  return children;
}
