alter table billing_enrollments drop constraint if exists billing_enrollments_plan_key_check;
alter table billing_enrollments add constraint billing_enrollments_plan_key_check check(plan_key in ('daily','weekly','monthly','yearly','custom'));
