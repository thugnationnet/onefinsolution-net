-- Workspace credit flexible amounts ($5-$500) + auto-reload amount.
-- Backward-compatible: defaults preserve the historical $5 / 50-credit pack.

begin;

alter table if exists workspace_credit_settings
  add column if not exists reload_amount_cents integer;

update workspace_credit_settings
set reload_amount_cents = 500
where reload_amount_cents is null;

alter table if exists workspace_credit_settings
  alter column reload_amount_cents set default 500;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workspace_credit_settings_reload_amount_cents_bounds'
  ) then
    alter table workspace_credit_settings
      add constraint workspace_credit_settings_reload_amount_cents_bounds
      check (
        reload_amount_cents is null
        or (reload_amount_cents >= 500 and reload_amount_cents <= 50000)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workspace_credit_purchases_amount_bounds'
  ) then
    alter table workspace_credit_purchases
      add constraint workspace_credit_purchases_amount_bounds
      check (amount >= 500 and amount <= 50000);
  end if;
exception
  when others then
    raise notice 'workspace_credit_purchases_amount_bounds not applied: %', sqlerrm;
end $$;

comment on column workspace_credit_settings.reload_amount_cents is
  'USD cents charged on each Workspace auto-reload ($5-$500).';

commit;
