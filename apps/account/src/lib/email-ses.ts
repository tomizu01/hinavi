import nodemailer, { type Transporter } from 'nodemailer';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  const host = process.env.SES_SMTP_HOST;
  const port = Number(process.env.SES_SMTP_PORT ?? 587);
  const user = process.env.SES_SMTP_USER;
  const pass = process.env.SES_SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error('SES_SMTP_HOST / SES_SMTP_USER / SES_SMTP_PASS が設定されていません');
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
  });
  return transporter;
}

type MagicLinkArgs = {
  to: string;
  url: string;
};

export async function sendMagicLinkEmail({ to, url }: MagicLinkArgs): Promise<void> {
  const from = process.env.AWS_SES_FROM;
  if (!from) throw new Error('AWS_SES_FROM が設定されていません');

  const ttlMin = Math.floor(Number(process.env.MAGIC_LINK_TTL_SECONDS ?? 900) / 60);
  const subject = '【みさひな】ログインリンク';
  const text =
    `下記のリンクをクリックするとログインが完了します（${ttlMin}分以内に有効）:\n\n` +
    `${url}\n\n` +
    `このメールに心当たりがない場合は破棄してください。`;
  const html = `
<!DOCTYPE html>
<html lang="ja"><body style="font-family: system-ui, sans-serif; line-height:1.6; color:#333;">
  <p>下記のボタンを押すとログインが完了します（${ttlMin}分以内に有効）。</p>
  <p style="margin: 24px 0;">
    <a href="${url}" style="display:inline-block; padding:12px 24px; background:#0a7; color:#fff; text-decoration:none; border-radius:6px;">ログインする</a>
  </p>
  <p style="font-size:12px; color:#666;">ボタンが押せない場合は下記URLを直接ブラウザに貼り付けてください。<br><a href="${url}">${url}</a></p>
  <hr style="border:none; border-top:1px solid #ddd; margin:24px 0;">
  <p style="font-size:12px; color:#999;">このメールに心当たりがない場合は破棄してください。</p>
</body></html>`.trim();

  await getTransporter().sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}
