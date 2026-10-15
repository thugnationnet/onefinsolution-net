from pathlib import Path

# --- workspace-actions.ts ---
path = Path('app/workspace-actions.ts')
text = path.read_text(encoding='utf-8')

if 'autoReload: await readWorkspaceAutoReloadSettings' not in text:
    needle = '      card: card[0] || null,\n    } as const;'
    if needle not in text:
        raise SystemExit('billing data needle not found: ' + repr(text[text.find('card: card'):text.find('card: card')+80] if 'card: card' in text else 'no card'))
    text = text.replace(
        needle,
        '      card: card[0] || null,\n      autoReload: await readWorkspaceAutoReloadSettings(user.id),\n    } as const;',
        1,
    )
    print('billing data patched')
else:
    print('billing data already patched')

if 'setWorkspaceAutoReloadSettings' not in text:
    append = r'''

export async function setWorkspaceAutoReloadSettings(input: {
  enabled: boolean;
  threshold?: number;
}): Promise<{ ok?: true; error?: string; autoReload?: WorkspaceAutoReloadSettings }> {
  const user = await currentUser();
  if (!user) return { error: 'Please sign in to manage Workspace auto-reload.' };
  if (!input || typeof input.enabled !== 'boolean') {
    return { error: 'Invalid auto-reload settings.' };
  }

  const threshold =
    input.threshold == null || input.threshold === undefined
      ? 1
      : Math.floor(Number(input.threshold));
  if (!Number.isSafeInteger(threshold) || threshold < 0 || threshold > 1_000_000) {
    return { error: 'Choose a valid auto-reload threshold.' };
  }

  try {
    const [card] = await query<{ payment_method_id: string | null }>(
      'select payment_method_id from workspace_credit_settings where user_id=$1',
      [user.id],
    );
    if (input.enabled && !card?.payment_method_id) {
      return { error: 'Save a Workspace card before enabling auto-reload.' };
    }

    await query(
      `insert into workspace_credit_settings(
         user_id, auto_reload_enabled, auto_reload_threshold, updated_at
       ) values ($1,$2,$3,now())
       on conflict (user_id) do update set
         auto_reload_enabled=excluded.auto_reload_enabled,
         auto_reload_threshold=excluded.auto_reload_threshold,
         updated_at=now()`,
      [user.id, input.enabled, threshold],
    );

    revalidatePath('/workspace');
    return {
      ok: true as const,
      autoReload: await readWorkspaceAutoReloadSettings(user.id),
    };
  } catch (error) {
    console.error('Unable to update Workspace auto-reload settings:', error);
    return {
      error:
        error instanceof Error && /auto_reload/i.test(error.message)
          ? 'Auto-reload is not available until database migration 015 is applied.'
          : 'Unable to update auto-reload settings. Please try again.',
    };
  }
}
'''
    text = text.rstrip() + append + '\n'
    print('settings action appended')
else:
    print('settings action already present')

if 'revalidatePath' not in text:
    # ensure import
    if "from 'next/cache'" not in text and 'from "next/cache"' not in text:
        text = text.replace(
            "import { currentUser } from '@/lib/session';",
            "import { revalidatePath } from 'next/cache';\nimport { currentUser } from '@/lib/session';",
            1,
        )
        print('revalidatePath import added')

path.write_text(text, encoding='utf-8')
print('workspace-actions written', path.stat().st_size)
