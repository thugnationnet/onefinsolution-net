'use client';
import { useAuth } from '@/lib/auth';
export function useWorkspacePreferences() {
  const {preferences}=useAuth();
  return preferences;
}
