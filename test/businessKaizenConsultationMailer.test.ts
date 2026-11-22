import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Mailer } from '../src/services/mailer';

const config = {
  host: '127.0.0.1', port: 587, user: 'synthetic-user',
  password: 'synthetic-password', from: 'original@atlib.jp',
  businessWebFrom: 'system@atlib.jp',
};

test('業務KAIZEN consultations use their dedicated sender without changing other mail', async () => {
  const mailer = new Mailer(config);
  const sent: Array<{from:string | {name:string;address:string};subject:string;to:string}> = [];
  (mailer as any).transporter = {
    sendMail: async (message: {from:string | {name:string;address:string};subject:string;to:string}) => {
      sent.push(message);
      return { accepted: [message.to] };
    },
  };

  await mailer.sendBusinessWebConsultationNotification('staff@example.test', {
    company: 'テスト株式会社', name: 'テスト太郎',
    email: 'tester@example.test', detailUrl: 'https://sales.atlib.jp/admin/example',
  });
  await mailer.sendBusinessWebConsultationThanks('tester@example.test','テスト太郎');
  await mailer.sendItManagementSurveyNotification('staff@example.test','https://example.test/');

  assert.deepEqual(sent.map(x=>x.from), [
    {name:'atLIB株式会社',address:'system@atlib.jp'},
    {name:'atLIB株式会社',address:'system@atlib.jp'},
    'original@atlib.jp',
  ]);
  assert.match(sent[0]!.subject,/業務KAIZEN/);
});

test('fallback stays backward compatible until sender address is approved', async () => {
  const mailer = new Mailer({ ...config, businessWebFrom: undefined });
  let from: string | {name:string;address:string} = '';
  (mailer as any).transporter = {sendMail: async (message: {from:string | {name:string;address:string}}) => {from=message.from;}};
  await mailer.sendBusinessWebConsultationThanks('tester@example.test','テスト太郎');
  assert.deepEqual(from,{name:'atLIB株式会社',address:'original@atlib.jp'});
});

test('admin pages display the new service label while URLs remain compatible', () => {
  for (const file of ['business-web-consultation-leads.html','business-web-consultation-lead-detail.html']) {
    const html = readFileSync(path.resolve(__dirname,'../public/admin',file),'utf8');
    assert.match(html,/<h1>業務KAIZEN 無料相談(?: 詳細)?<\/h1>/);
    assert.doesNotMatch(html,/<h1>Business Web/);
    assert.match(html,/business-web-consultation-leads/);
  }
});
