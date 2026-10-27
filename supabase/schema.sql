-- =====================================================================
--  Sensei 評価 / Sensei Score  データベース定義
--  Supabase の「SQL Editor」に全文を貼り付けて「Run」を押してください。
--  何度実行しても壊れないように書いてあります（初回は1回でOK）。
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 管理者
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to anon, authenticated;

drop policy if exists admins_self on public.admins;
create policy admins_self on public.admins for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 利用規約への同意
-- ---------------------------------------------------------------------
create table if not exists public.consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms_version text not null,
  agreed_at timestamptz not null default now()
);
alter table public.consents enable row level security;
drop policy if exists consents_own on public.consents;
create policy consents_own on public.consents for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 大学
--   id：文部科学省の学校コード（例 F113110102700）。利用者が追加した大学は u_ から始まる。
-- ---------------------------------------------------------------------
create table if not exists public.universities (
  id text primary key,
  name text not null,
  name_en text,
  kana text,
  pref text not null,
  status text not null default 'active' check (status in ('active','hidden')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.universities enable row level security;
drop policy if exists uni_read on public.universities;
drop policy if exists uni_insert on public.universities;
drop policy if exists uni_admin on public.universities;
create policy uni_read on public.universities for select using (status = 'active' or public.is_admin());
create policy uni_insert on public.universities for insert to authenticated
  with check (created_by = auth.uid() and status = 'active' and id like 'u\_%');
create policy uni_admin on public.universities for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 先生
-- ---------------------------------------------------------------------
create table if not exists public.professors (
  id uuid primary key default gen_random_uuid(),
  university_id text not null references public.universities(id) on delete cascade,
  name text,
  name_en text,
  kana text,
  dept text not null check (char_length(dept) between 1 and 60),
  status text not null default 'active' check (status in ('active','hidden')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (coalesce(name,'') <> '' or coalesce(name_en,'') <> '')
);
create index if not exists professors_uni_idx on public.professors(university_id);
alter table public.professors enable row level security;
alter table public.professors add column if not exists dept_en text;
alter table public.professors drop constraint if exists professors_name_en_required;
alter table public.professors add constraint professors_name_en_required check (name_en is not null and btrim(name_en) <> '');
drop policy if exists prof_read on public.professors;
drop policy if exists prof_insert on public.professors;
drop policy if exists prof_admin on public.professors;
create policy prof_read on public.professors for select using (status = 'active' or public.is_admin());
create policy prof_insert on public.professors for insert to authenticated
  with check (created_by = auth.uid() and status = 'active');
create policy prof_admin on public.professors for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 先生のレビュー
--   書き込みはサーバー（AIチェック後）だけが行う。退会しても投稿を残せるよう user_id は null 可。
-- ---------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references public.professors(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  course text not null check (char_length(course) between 1 and 60),
  quality smallint not null check (quality between 1 and 5),
  difficulty smallint not null check (difficulty between 1 and 5),
  would_take_again boolean,
  attendance_required boolean,
  grade text check (grade in ('秀','優','良','可','不可')),
  body text check (body is null or char_length(body) between 1 and 350),
  ai_checked boolean not null default false,
  status text not null default 'published' check (status in ('published','hidden')),
  created_at timestamptz not null default now()
);
create index if not exists reviews_prof_idx on public.reviews(professor_id);
create unique index if not exists reviews_one_per_course on public.reviews(user_id, professor_id, course) where user_id is not null;
alter table public.reviews enable row level security;
drop policy if exists rev_own_read on public.reviews;
drop policy if exists rev_own_delete on public.reviews;
drop policy if exists rev_admin on public.reviews;
create policy rev_own_read on public.reviews for select using (user_id = auth.uid() or public.is_admin());
create policy rev_own_delete on public.reviews for delete using (user_id = auth.uid() or public.is_admin());
create policy rev_admin on public.reviews for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 先生からの返信（本人確認済みの先生だけ。書き込みはサーバー）
-- ---------------------------------------------------------------------
create table if not exists public.faculty_verified (
  professor_id uuid primary key references public.professors(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  verified_at timestamptz not null default now()
);
alter table public.faculty_verified enable row level security;
drop policy if exists fv_read on public.faculty_verified;
drop policy if exists fv_admin on public.faculty_verified;
create policy fv_read on public.faculty_verified for select using (user_id = auth.uid() or public.is_admin());
create policy fv_admin on public.faculty_verified for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.replies (
  review_id uuid primary key references public.reviews(id) on delete cascade,
  professor_id uuid not null references public.professors(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 10 and 300),
  created_at timestamptz not null default now()
);
alter table public.replies enable row level security;
drop policy if exists rep_own on public.replies;
drop policy if exists rep_own_delete on public.replies;
create policy rep_own on public.replies for select using (user_id = auth.uid() or public.is_admin());
create policy rep_own_delete on public.replies for delete using (user_id = auth.uid() or public.is_admin());

create table if not exists public.faculty_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  university_id text not null references public.universities(id) on delete cascade,
  professor_id uuid not null references public.professors(id) on delete cascade,
  email text not null check (char_length(email) <= 120),
  title text check (char_length(title) <= 40),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
alter table public.faculty_claims enable row level security;
drop policy if exists fc_insert on public.faculty_claims;
drop policy if exists fc_read on public.faculty_claims;
drop policy if exists fc_admin on public.faculty_claims;
create policy fc_insert on public.faculty_claims for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
create policy fc_read on public.faculty_claims for select using (user_id = auth.uid() or public.is_admin());
create policy fc_admin on public.faculty_claims for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 大学の評価（10項目）
-- ---------------------------------------------------------------------
create table if not exists public.school_ratings (
  id uuid primary key default gen_random_uuid(),
  university_id text not null references public.universities(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  rep smallint not null check (rep between 1 and 5),
  loc smallint not null check (loc between 1 and 5),
  car smallint not null check (car between 1 and 5),
  fac smallint not null check (fac between 1 and 5),
  net smallint not null check (net between 1 and 5),
  food smallint not null check (food between 1 and 5),
  club smallint not null check (club between 1 and 5),
  life smallint not null check (life between 1 and 5),
  safe smallint not null check (safe between 1 and 5),
  happy smallint not null check (happy between 1 and 5),
  body text check (char_length(body) <= 200),
  ai_checked boolean not null default false,
  status text not null default 'published' check (status in ('published','hidden')),
  created_at timestamptz not null default now()
);
create index if not exists school_uni_idx on public.school_ratings(university_id);
alter table public.school_ratings enable row level security;
drop policy if exists sr_own_read on public.school_ratings;
drop policy if exists sr_own_delete on public.school_ratings;
drop policy if exists sr_admin on public.school_ratings;
create policy sr_own_read on public.school_ratings for select using (user_id = auth.uid() or public.is_admin());
create policy sr_own_delete on public.school_ratings for delete using (user_id = auth.uid() or public.is_admin());
create policy sr_admin on public.school_ratings for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 過去問・資料（写真は Storage の非公開バケット exams/<id>/<n>.jpg）
-- ---------------------------------------------------------------------
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references public.professors(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  course text not null check (char_length(course) between 1 and 60),
  year int not null check (year between 2000 and 2100),
  term text not null check (term in ('前期','後期','通年','集中')),
  kind text not null check (kind in ('期末試験','中間試験','小テスト','レポート課題','その他')),
  pages smallint not null check (pages between 1 and 6),
  memo text check (char_length(memo) <= 300),
  status text not null default 'published' check (status in ('published','hidden')),
  created_at timestamptz not null default now()
);
create index if not exists exams_prof_idx on public.exams(professor_id);
alter table public.exams enable row level security;
drop policy if exists ex_own_read on public.exams;
drop policy if exists ex_admin on public.exams;
create policy ex_own_read on public.exams for select using (user_id = auth.uid() or public.is_admin());
create policy ex_admin on public.exams for update using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public) values ('exams','exams', false)
on conflict (id) do nothing;
drop policy if exists exams_files_read on storage.objects;
create policy exams_files_read on storage.objects for select to authenticated using (bucket_id = 'exams');

-- ---------------------------------------------------------------------
-- 通報・削除依頼
-- ---------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  kind text not null check (kind in ('review','school','exam','reply')),
  target_id uuid not null,
  reason text not null check (reason in ('abuse','personal','false','offtopic','copyright','other')),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);
create unique index if not exists reports_once on public.reports(user_id, kind, target_id) where user_id is not null;
alter table public.reports enable row level security;
drop policy if exists rp_insert on public.reports;
drop policy if exists rp_read on public.reports;
drop policy if exists rp_admin on public.reports;
create policy rp_insert on public.reports for insert to authenticated with check (user_id = auth.uid());
create policy rp_read on public.reports for select using (user_id = auth.uid() or public.is_admin());
create policy rp_admin on public.reports for delete using (public.is_admin());

create table if not exists public.removal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 1 and 60),
  university text not null check (char_length(university) between 1 and 80),
  role text not null check (role in ('self','staff','other')),
  scope text not null check (scope in ('page','review','exam')),
  target text not null check (char_length(target) between 1 and 200),
  reason text not null check (char_length(reason) between 1 and 1000),
  email text not null check (char_length(email) <= 120),
  professor_id uuid references public.professors(id) on delete set null,
  status text not null default 'open' check (status in ('open','done')),
  created_at timestamptz not null default now()
);
alter table public.removal_requests enable row level security;
drop policy if exists rr_insert on public.removal_requests;
drop policy if exists rr_read on public.removal_requests;
drop policy if exists rr_admin on public.removal_requests;
-- 削除依頼はログインしていなくても送れる
create policy rr_insert on public.removal_requests for insert to anon, authenticated
  with check ((user_id is null or user_id = auth.uid()) and status = 'open');
create policy rr_read on public.removal_requests for select using (user_id = auth.uid() or public.is_admin());
create policy rr_admin on public.removal_requests for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- AI要約（サーバーが書き込む）
-- ---------------------------------------------------------------------
create table if not exists public.summaries (
  professor_id uuid not null references public.professors(id) on delete cascade,
  lang text not null check (lang in ('ja','en')),
  lines jsonb not null,
  review_count int not null,
  updated_at timestamptz not null default now(),
  primary key (professor_id, lang)
);
alter table public.summaries enable row level security;
drop policy if exists sum_read on public.summaries;
create policy sum_read on public.summaries for select using (true);

-- =====================================================================
--  公開用のビュー（投稿者が誰かは含めない。自分の投稿かどうかだけを返す）
-- =====================================================================
drop view if exists public.professor_stats;
create view public.professor_stats as
select p.id, p.university_id, p.name, p.name_en, p.kana, p.dept,
       count(r.id)::int as n,
       round(avg(r.quality)::numeric, 1) as q,
       round(avg(r.difficulty)::numeric, 1) as d,
       round(100.0 * avg(case when r.would_take_again then 1 when r.would_take_again = false then 0 end))::int as again_pct,
       exists (select 1 from public.faculty_verified v where v.professor_id = p.id) as verified,
       (p.created_by is not null and p.created_by = auth.uid()) as added_by_me,
       p.dept_en
from public.professors p
left join public.reviews r on r.professor_id = p.id and r.status = 'published'
where p.status = 'active'
group by p.id;

drop view if exists public.reviews_public;
create view public.reviews_public as
select r.id, r.professor_id, r.course, r.quality, r.difficulty, r.would_take_again, r.attendance_required,
       r.grade, r.body, r.created_at, (r.user_id is not null and r.user_id = auth.uid()) as is_mine
from public.reviews r
where r.status = 'published';

drop view if exists public.replies_public;
create view public.replies_public as
select x.review_id, x.professor_id, x.body, x.created_at, (x.user_id is not null and x.user_id = auth.uid()) as is_mine
from public.replies x
join public.faculty_verified v on v.professor_id = x.professor_id and v.user_id = x.user_id;

drop view if exists public.school_ratings_public;
create view public.school_ratings_public as
select s.id, s.university_id, s.rep, s.loc, s.car, s.fac, s.net, s.food, s.club, s.life, s.safe, s.happy,
       s.body, s.created_at, (s.user_id is not null and s.user_id = auth.uid()) as is_mine
from public.school_ratings s
where s.status = 'published';

-- 過去問はログインした人だけが読める
drop view if exists public.exams_public;
create view public.exams_public as
select e.id, e.professor_id, e.course, e.year, e.term, e.kind, e.pages, e.memo, e.created_at,
       (e.user_id is not null and e.user_id = auth.uid()) as is_mine
from public.exams e
where e.status = 'published' and auth.uid() is not null;

grant select on public.professor_stats, public.reviews_public, public.replies_public,
  public.school_ratings_public, public.exams_public to anon, authenticated;

-- =====================================================================
--  自分が追加した先生・大学の削除
-- =====================================================================
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

-- =====================================================================
--  大学ごとの学部一覧
-- =====================================================================
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

