-- conversations.speaker の 'hiyori' を 'hinata' に書き換え
-- 実行: mysql -u <user> -p <db> < sql/migrations/20260629_rename_hiyori_to_hinata.sql

UPDATE conversations SET speaker = 'hinata' WHERE speaker = 'hiyori';
