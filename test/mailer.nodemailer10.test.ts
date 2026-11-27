import assert from 'node:assert/strict';
import test from 'node:test';
import { Mailer } from '../src/services/mailer';

test('all mailer paths build messages with Nodemailer 10 without sending mail', async () => {
  const mailer = new Mailer({
    host: 'smtp.invalid',
    port: 587,
    user: 'test-user',
    password: 'test-password',
    from: 'sender@example.test',
  });
  const sent: Array<Record<string, unknown>> = [];
  Object.defineProperty(mailer, 'transporter', {
    value: { sendMail: async (message: Record<string, unknown>) => { sent.push(message); } },
  });

  await mailer.sendItManagementSurveyNotification('ops@example.test', 'https://example.test/survey');
  await mailer.sendBusinessWebConsultationNotification('ops@example.test', {
    company: 'Synthetic Co.', name: 'Test User', email: 'user@example.test', detailUrl: 'https://example.test/leads/1',
  });
  await mailer.sendBusinessWebConsultationThanks('user@example.test', 'Test User');
  await mailer.sendDiagnosticSubmissionNotification('ops@example.test', {
    id: 'diagnosis-1', companyName: 'Synthetic Co.', contactName: 'Test User', email: 'user@example.test',
    submittedAt: new Date('2026-01-01T00:00:00Z'), categoryScores: { governance: 80 },
    recommendations: {} as never, detailUrl: 'https://example.test/diagnoses/1',
  });
  await mailer.sendInfraVisionPartnerLeadNotification('ops@example.test', {
    company: 'Synthetic Co.', name: 'Test User', email: 'user@example.test', detailUrl: 'https://example.test/leads/2',
  });
  await mailer.sendInfraVisionPartnerLeadThanks('user@example.test', { name: 'Test User', scheduleUrl: 'https://example.test/schedule' });
  await mailer.sendWebDevelopmentPartnerLeadNotification('ops@example.test', {
    company: 'Synthetic Co.', name: 'Test User', email: 'user@example.test', detailUrl: 'https://example.test/leads/3',
  });
  await mailer.sendWebDevelopmentPartnerLeadThanks('user@example.test', { name: 'Test User', scheduleUrl: 'https://example.test/schedule' });
  await mailer.sendKaizenDiagnosticLinkEmail('user@example.test', { name: 'Test User', formUrl: 'https://example.test/kaizen' });
  await mailer.sendKaizenLeadNotification('ops@example.test', {
    company: 'Synthetic Co.', name: 'Test User', email: 'user@example.test',
  });

  assert.equal(sent.length, 10);
  for (const message of sent) {
    assert.equal(message.from, 'sender@example.test');
    assert.equal(typeof message.to, 'string');
    assert.equal(typeof message.subject, 'string');
    assert.equal(typeof message.text, 'string');
  }
});
