import {currentUser} from '@/lib/session';
import {redirect} from 'next/navigation';
export const metadata={title:'Context Library',robots:{index:false,follow:false}};
export default async function Layout({children}:{children:React.ReactNode}) {
 if(!await currentUser()) redirect('/sign-in');
 return children;
}
