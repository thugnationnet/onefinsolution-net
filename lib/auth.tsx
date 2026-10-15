'use client';
import {createContext,useContext,useState,useEffect,ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {defaultPreferences} from '@/lib/account-preferences';
const Context=createContext({isAuthenticated:false,isLoading:true,preferences:defaultPreferences,login:()=>{},logout:()=>{}});
export function AuthProvider({children}:{children:ReactNode}) {
 const [isAuthenticated,setAuthenticated]=useState(false);
 const [preferences,setPreferences]=useState(defaultPreferences);
 const pathname=usePathname();
 const [checkedPath,setCheckedPath]=useState<string|null>(null);
 const isLoading=checkedPath!==pathname;
 useEffect(()=>{
   let active=true;
   let controller:AbortController;
   const refresh=()=>{
     controller?.abort(); controller=new AbortController();
     const signal=controller.signal;
     fetch('/api/account/session',{cache:'no-store',signal}).then(async response=>{
       if(!response.ok) throw new Error('Unable to load account.');
       const data=await response.json();
       if(active&&!signal.aborted){setAuthenticated(data.isAuthenticated===true);setPreferences(data.preferences);}
     }).catch(()=>{if(active&&!signal.aborted){setAuthenticated(false);setPreferences(defaultPreferences);}})
       .finally(()=>{if(active&&!signal.aborted)setCheckedPath(pathname);});
   };
   refresh(); window.addEventListener('focus',refresh);
   return ()=>{active=false;controller?.abort();window.removeEventListener('focus',refresh);};
 },[pathname]);
 return <Context.Provider value={{isAuthenticated,isLoading,preferences,login:()=>{setAuthenticated(true);setCheckedPath(pathname);},logout:()=>{setAuthenticated(false);setPreferences(defaultPreferences);setCheckedPath(pathname);}}}>{children}</Context.Provider>;
}
export function useAuth(){return useContext(Context);}
