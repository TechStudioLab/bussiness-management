import type { MessageKind } from './types';

// What kind of incoming mail is this? Only real replies count toward the reply
// rate: form receipts, auto-responders and bounces are kept apart.

export interface MailHeaders {
  from: string;
  subject: string;
  autoSubmitted?: string;
  precedence?: string;
  xAutoreply?: string;
  xAutoResponse?: string;
}

const bounceFrom = /mailer-daemon|postmaster|mail-daemon/i;
const bounceSubject = /undeliver|delivery status|delivery failure|returned mail|mail delivery failed|failure notice|配信不能|配送失敗|送信できませんでした|宛先不明|エラーメール/i;
const autoFrom = /no-?reply|do-?not-?reply|noreply|auto-?(reply|confirm)|autoresponder/i;
const autoSubject =
  /自動返信|自動送信|自動応答|自動配信|auto.?reply|automatic reply|autoreply|out of office|不在(のお知らせ|通知)|受付(完了|いたしました|致しました|しました)|受け付けました|お問い?合わ?せ(いただき|頂き)?(誠に)?ありがとう|送信(完了|が完了)|【自動|\[自動|お問い?合わ?せ(を)?受付/i;

export const classifyIncoming = (h: MailHeaders): MessageKind => {
  if (bounceFrom.test(h.from) || bounceSubject.test(h.subject)) return 'bounce';
  const auto = (h.autoSubmitted ?? '').toLowerCase();
  if (auto && auto !== 'no') return 'auto';
  if (h.xAutoreply || h.xAutoResponse) return 'auto';
  if (/auto_reply|bulk|junk|list/i.test(h.precedence ?? '')) return 'auto';
  // A person replying keeps "Re:" — trust it unless the headers said otherwise
  if (/^\s*(re|ｒｅ|返信)\s*[:：]/i.test(h.subject)) return 'reply';
  if (autoFrom.test(h.from) || autoSubject.test(h.subject)) return 'auto';
  return 'reply';
};

export const kindLabel: Record<MessageKind, string> = {
  sent: '送信',
  reply: '返信',
  auto: '自動返信',
  bounce: '不達'
};
