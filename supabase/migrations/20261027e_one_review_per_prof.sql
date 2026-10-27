drop index if exists public.reviews_one_per_course;
create unique index if not exists reviews_one_per_prof on public.reviews(user_id, professor_id) where user_id is not null;
