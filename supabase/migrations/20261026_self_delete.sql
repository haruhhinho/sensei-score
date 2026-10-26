-- 2026-10-26 追加分：自分が追加した先生・大学をすぐに削除できるようにする
-- Supabase の SQL Editor で、この内容をすべて貼り付けて Run してください（何度実行しても大丈夫です）。

-- 先生の一覧に「自分が追加したか」を加える
drop view if exists public.professor_stats;
create view public.professor_stats as
select p.id, p.university_id, p.name, p.name_en, p.kana, p.dept,
       count(r.id)::int as n,
       round(avg(r.quality)::numeric, 1) as q,
       round(avg(r.difficulty)::numeric, 1) as d,
       round(100.0 * avg(case when r.would_take_again then 1 when r.would_take_again = false then 0 end))::int as again_pct,
       exists (select 1 from public.faculty_verified v where v.professor_id = p.id) as verified,
       (p.created_by is not null and p.created_by = auth.uid()) as added_by_me
from public.professors p
left join public.reviews r on r.professor_id = p.id and r.status = 'published'
where p.status = 'active'
group by p.id;
grant select on public.professor_stats to anon, authenticated;

-- 自分が追加した先生を削除する。ほかの人のレビュー・資料・返信があるときは削除しない（削除依頼で対応）
create or replace function public.delete_own_professor(pid uuid)
returns text language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  if auth.uid() is null then return 'not_signed_in'; end if;
  select created_by into owner from public.professors where id = pid;
  if not found then return 'not_found'; end if;
  if owner is distinct from auth.uid() then return 'not_owner'; end if;
  if exists (select 1 from public.reviews where professor_id = pid and user_id is distinct from auth.uid())
     or exists (select 1 from public.replies where professor_id = pid and user_id is distinct from auth.uid())
     or exists (select 1 from public.faculty_verified where professor_id = pid)
  then return 'has_others'; end if;
  if exists (select 1 from public.exams where professor_id = pid) then return 'has_exams'; end if;
  delete from public.professors where id = pid;
  return 'ok';
end $$;
revoke all on function public.delete_own_professor(uuid) from public, anon;
grant execute on function public.delete_own_professor(uuid) to authenticated;

-- 自分が追加した大学を削除する。先生やほかの人の大学評価があるときは削除しない
create or replace function public.delete_own_university(uid text)
returns text language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  if auth.uid() is null then return 'not_signed_in'; end if;
  select created_by into owner from public.universities where id = uid;
  if not found then return 'not_found'; end if;
  if owner is distinct from auth.uid() then return 'not_owner'; end if;
  if exists (select 1 from public.professors where university_id = uid) then return 'has_profs'; end if;
  if exists (select 1 from public.school_ratings where university_id = uid and user_id is distinct from auth.uid()) then return 'has_others'; end if;
  delete from public.universities where id = uid;
  return 'ok';
end $$;
revoke all on function public.delete_own_university(text) from public, anon;
grant execute on function public.delete_own_university(text) to authenticated;
