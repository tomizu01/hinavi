-- 2026-06-30: 「ひなた → ひより」リネームを巻き戻し
-- 経緯: 既に X 上で「みさき×ひより」プロモーションが開始済みのため、表示名/識別子を ひより に戻す。
-- ドメイン misahina.com は据え置き（みさ・ひ・な = みさき×ひより なかよしtalk の略）。
-- 直前の 20260629_rename_hiyori_to_hinata.sql の逆操作。
-- 実行: mysql -u <user> -p <db> < sql/migrations/20260630_revert_hinata_to_hiyori.sql

UPDATE conversations SET speaker = 'hiyori' WHERE speaker = 'hinata';
