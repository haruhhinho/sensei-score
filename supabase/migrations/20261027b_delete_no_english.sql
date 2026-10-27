-- 英語名のない先生を削除する（先に管理画面で sensei-teachers.csv を読み込み直し、英語名を書き足してから実行）
-- 1) 件数の確認
select count(*) as no_english from public.professors where name_en is null or btrim(name_en) = '';
-- 2) 削除（その先生へのレビュー・資料も一緒に消えます）
delete from public.professors where name_en is null or btrim(name_en) = '';
-- 3) 今後は英語名なしでは登録できないようにする
alter table public.professors drop constraint if exists professors_name_en_required;
alter table public.professors add constraint professors_name_en_required check (name_en is not null and btrim(name_en) <> '');
