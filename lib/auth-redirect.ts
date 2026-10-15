export function authRedirect(path: string, authenticated: boolean): string | null {
  const protectedPage = ['/account', '/dashboard', '/chat', '/context', '/c', '/protected'].some(prefix => path === prefix || path.startsWith(`${prefix}/`));
  if (!authenticated && protectedPage) return '/sign-in';
  if (authenticated && ['/sign-in', '/sign-up'].includes(path)) return '/';
  return null;
}
