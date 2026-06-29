# systemd unit files

本番サーバ構築時にコピーして使う雛形。`/var/www/hinavi/` を `WorkingDirectory` とする。

## インストール手順

```bash
# 1. 配置（root権限が必要）
sudo cp /var/www/hinavi/deploy/systemd/hinavi-tabikoto.service /etc/systemd/system/
sudo cp /var/www/hinavi/deploy/systemd/hinavi-account.service /etc/systemd/system/

# 2. ログディレクトリ準備
sudo mkdir -p /var/log/hinavi
sudo chown ec2-user:ec2-user /var/log/hinavi

# 3. ビルド（事前にやっておく）
cd /var/www/hinavi
npm install
npm run build

# 4. unit を読込み、自動起動有効化、起動
sudo systemctl daemon-reload
sudo systemctl enable --now hinavi-tabikoto.service
sudo systemctl enable --now hinavi-account.service

# 5. 起動確認
systemctl status hinavi-tabikoto hinavi-account
ss -tlnp | grep -E ':(6500|6501) '
```

## 運用コマンド

```bash
# 再起動
sudo systemctl restart hinavi-tabikoto
sudo systemctl restart hinavi-account

# 状態確認
systemctl status hinavi-tabikoto
systemctl status hinavi-account

# ログ確認（systemd ジャーナル + 個別ファイル）
journalctl -u hinavi-tabikoto -f
journalctl -u hinavi-account -f
tail -f /var/log/hinavi/tabikoto.log
tail -f /var/log/hinavi/account.log

# 停止
sudo systemctl stop hinavi-tabikoto
sudo systemctl stop hinavi-account
```

## 注意

- **`.env.local` は `/var/www/hinavi/.env.local`** を読む（apps/*/.env.local は symlink でこれを指している）
- **RS256 鍵ファイル**は本番では別途生成して `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH` の絶対パスを更新
- **npm のパス**は `which npm` で確認。`/usr/bin/npm` でない場合は ExecStart を修正
- **Node の前提**: Node 18+（Next 16 の要件）。Node 22 で動作確認済
- DB マイグレーション (`sql/schema.sql`) は手動実行。systemd 起動前に流しておく
