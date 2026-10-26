-- 2026-10-26 追加分(3)：レビューのコメントを任意にする
-- Supabase の SQL Editor で、この内容をすべて貼り付けて Run してください（何度実行しても大丈夫です）。
alter table public.reviews alter column body drop not null;
alter table public.reviews drop constraint if exists reviews_body_check;
alter table public.reviews add constraint reviews_body_check check (body is null or char_length(body) between 15 and 350);
