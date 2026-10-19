begin;

alter table software_storefront_purchases
  drop constraint if exists software_storefront_purchases_currency_check;

alter table software_storefront_purchases
  add constraint software_storefront_purchases_currency_check
  check (currency in ('usd', 'thb'));

commit;
