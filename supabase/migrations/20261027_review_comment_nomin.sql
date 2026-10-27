-- 2026-10-27：レビューの任意コメントの最低文字数（15字）をなくす
-- Supabase の SQL Editor で、この内容をすべて貼り付けて Run してください（何度実行しても大丈夫です）。
alter table public.reviews drop constraint if exists reviews_body_check;
alter table public.reviews add constraint reviews_body_check check (body is null or char_length(body) between 1 and 350);
