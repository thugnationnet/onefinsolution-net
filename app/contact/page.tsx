import Link from 'next/link';
import { PageHeading } from '@/components/page-heading';
import { ContactForm } from '@/components/contact-form';
import { currentUser } from '@/lib/session';
import { company } from '@/lib/company';
export const metadata={
  title:'Contact One Fin Solution',
  description:'Contact the One Fin Solution team for account, subscription, Workspace, or technical support.',
  alternates:{canonical:'/contact'},
  openGraph:{
    type:'website',siteName:'One Fin Solution',
    title:'Contact One Fin Solution',description:'Get help with your account, subscription, Workspace, or technical support.',url:'/contact',
    images:[
      {url:'/images/iages4.jpg',width:2000,height:1094,alt:'Artificial intelligence network visual'},
      {url:'/logo/one-fin-logo.png',width:1254,height:1254,alt:'One Fin Solution logo'},
    ],
  },
};
export default async function Contact({searchParams}:{searchParams:Promise<{category?:string;subject?:string}>}) {
  const [user,params]=await Promise.all([currentUser(),searchParams]);
  return <div className="page-wrap"><PageHeading eyebrow="CONTACT US" title="Let’s get you to the right place." description="Questions about your account, a plan, or something that is not working? Send a request to the One Fin team." /><div className="two-grid"><ContactForm email={user?.email} category={params.category} subject={params.subject} /><aside className="stack" style={{alignSelf:'start'}}><div className="panel"><h2>One Fin Solution</h2><p>{company.name}</p><p>Company registration<br /><strong>{company.registrationNumber}</strong></p><p>Our online support form accepts requests from customers around the world.</p><p>Keep your request reference. Signed-in requests are linked to your account so you can see their status and any response in your dashboard.</p></div><div className="panel"><h3>Find an answer now</h3><p>Our help center covers passwords, plans, credits, and your workspace.</p><Link className="text-link" href="/support">Browse the help center →</Link></div></aside></div></div>;
}
