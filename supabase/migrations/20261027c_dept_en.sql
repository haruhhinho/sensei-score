-- 学部名の英語（大学の公式の英語表記）を先生ごとに持てるようにする
alter table public.professors add column if not exists dept_en text;
create or replace view public.professor_stats as
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
grant select on public.professor_stats to anon, authenticated;
