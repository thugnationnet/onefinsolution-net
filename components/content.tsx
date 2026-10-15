"use client";

import { usePathname } from "next/navigation";

export default function Content({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === '/sign-in' || pathname === '/sign-up';

  return (
    <div className={isAuthPage ? "w-full" : "py-6 px-6 w-full flex items-center justify-between mx-auto"}>
      {children}
    </div>
  );
}
