'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ThemeProvider } from 'next-themes';
import { SidebarComponent } from '@/components/sidebar';
import { SiteFooter, SiteHeader } from '@/components/site-navigation';
import { AuthProvider, useAuth } from '@/lib/auth';
import { getSubscriptionDetails } from '@/app/actions';
import { CheckoutSuccessHandler } from '@/components/checkout-success-handler';

interface ClientLayoutProps {
  children: React.ReactNode;
}

function ClientLayoutContent({ children }: ClientLayoutProps) {
  const pathname = usePathname();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isHomePage = pathname === '/' || pathname.startsWith('/c/');
  const isWorkspacePage = pathname === '/workspace';
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activePlanName, setActivePlanName] = useState<string | null>(null);
  const [activePlanStatus, setActivePlanStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  useEffect(() => {
    let active = true;

    if (!isHomePage || !isAuthenticated) {
      setActivePlanName(null);
      setActivePlanStatus('loaded');
      return () => {
        active = false;
      };
    }

    const loadSubscription = async () => {
      setActivePlanStatus('loading');
      try {
        const details = await getSubscriptionDetails();
        if (!active) return;
        setActivePlanName(details.planName);
        setActivePlanStatus(details.error ? 'error' : 'loaded');
      } catch (error: unknown) {
        console.error('Error fetching subscription status:', error);
        if (active) {
          setActivePlanName(null);
          setActivePlanStatus('error');
        }
      }
    };
    const refreshSubscription = () => void loadSubscription();
    void loadSubscription();
    window.addEventListener('homepage-subscription-updated', refreshSubscription);
    return () => {
      active = false;
      window.removeEventListener('homepage-subscription-updated', refreshSubscription);
    };
  }, [isAuthenticated, isHomePage]);

  useEffect(() => {
    const syncSidebarToViewport = () => {
      const isSmallScreen = window.matchMedia('(max-width: 760px)').matches;
      setIsSidebarCollapsed(isSmallScreen);
      setIsMobileSidebarOpen(false);
    };
    syncSidebarToViewport();
    window.addEventListener('resize', syncSidebarToViewport);
    return () => window.removeEventListener('resize', syncSidebarToViewport);
  }, []);

  const toggleSidebarCollapse = () => {
    if (window.matchMedia('(max-width: 760px)').matches) {
      const shouldExpand = isSidebarCollapsed;
      setIsSidebarCollapsed(!shouldExpand);
      setIsMobileSidebarOpen(shouldExpand);
    } else {
      setIsSidebarCollapsed((collapsed) => !collapsed);
    }
  };

  return (
    <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
      <CheckoutSuccessHandler />
      {isHomePage ? (
        <div className="home-chat-shell">
          <SidebarComponent
            className={`home-chat-sidebar${isMobileSidebarOpen ? ' is-mobile-open' : ''}${isSidebarCollapsed ? ' is-collapsed' : ''}`}
            isAuthenticated={isAuthenticated}
            isAuthLoading={isAuthLoading}
            collapsed={isSidebarCollapsed}
            onToggleCollapse={toggleSidebarCollapse}
            activePlanName={activePlanName}
            activePlanStatus={activePlanStatus}
          />
          {isMobileSidebarOpen && (
            <button
              className="home-chat-backdrop"
              type="button"
              aria-label="Close workspace menu"
              onClick={() => { setIsMobileSidebarOpen(false); setIsSidebarCollapsed(true); }}
            />
          )}
          <main className="home-chat-main">
            <button
              className="home-chat-menu"
              type="button"
              aria-label="Open chat menu"
              aria-expanded={isMobileSidebarOpen}
              onClick={() => {
                setIsSidebarCollapsed(false);
                setIsMobileSidebarOpen(true);
              }}
            >
              <span /><span /><span />
            </button>
            {children}
          </main>
        </div>
      ) : isWorkspacePage ? (
        <div className="workspace-route-shell">{children}</div>
      ) : (
        <div className="site-shell">
          <a className="skip-link" href="#main-content">Skip to content</a>
          <SiteHeader />
          <main id="main-content" className={`site-main${pathname.startsWith('/c/') ? ' chat-conversation-main' : ''}`}>
            {children}
          </main>
          <SiteFooter />
        </div>
      )}
    </ThemeProvider>
  );
}

export function ClientLayout({ children }: ClientLayoutProps) {
  return (
    <AuthProvider>
      <ClientLayoutContent>{children}</ClientLayoutContent>
    </AuthProvider>
  );
}
