alter table public.removal_requests drop constraint if exists removal_requests_reason_check;
alter table public.removal_requests add constraint removal_requests_reason_check check (char_length(reason) between 1 and 1000);
