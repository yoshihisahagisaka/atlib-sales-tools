import assert from 'node:assert/strict';
import test from 'node:test';
import nodemailer from 'nodemailer';

test('Nodemailer 10 preserves the notification, reply-to, and customer-recipient address contract', async () => {
  const transport = nodemailer.createTransport({ jsonTransport: true });

  const notification = await transport.sendMail({
    from: 'Sales Tools <no-reply@atlib.test>',
    to: 'staff@atlib.test',
    replyTo: 'customer@example.test',
    subject: 'New consultation',
    text: 'A consultation was submitted.',
  });
  const customerReply = await transport.sendMail({
    from: 'Sales Tools <no-reply@atlib.test>',
    to: 'customer@example.test',
    subject: 'Consultation accepted',
    text: 'Thank you.',
  });

  assert.deepEqual(notification.envelope.to, ['staff@atlib.test']);
  assert.deepEqual(customerReply.envelope.to, ['customer@example.test']);
  const notificationMessage = JSON.parse(String(notification.message)) as { replyTo?: { address?: string }[] };
  assert.equal(notificationMessage.replyTo?.[0]?.address, 'customer@example.test');
});
