-- 2026-10-26 追加分(2)：大学ごとの学部一覧（先生を追加するときのプルダウンに使う）
-- Supabase の SQL Editor で、この内容をすべて貼り付けて Run してください（何度実行しても大丈夫です）。

create table if not exists public.faculties (
  university_id text not null references public.universities(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  sort int not null default 0,
  primary key (university_id, name)
);
alter table public.faculties enable row level security;
drop policy if exists fac_read on public.faculties;
drop policy if exists fac_admin on public.faculties;
create policy fac_read on public.faculties for select using (true);
create policy fac_admin on public.faculties for all using (public.is_admin()) with check (public.is_admin());
grant select on public.faculties to anon, authenticated;

-- すでに登録されている先生の「学部」から、学科やコースの部分を取り除く（例：経済学部 経済学科 → 経済学部）
update public.professors
set dept = substring(dept from '^(.*?学部)')
where dept ~ '^.*?学部.+';
