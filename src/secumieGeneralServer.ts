import path from 'node:path';
import { Mailer } from './services/mailer';
import { ConsultationHandoff, SECUMIE_SCHEDULE_URLS, type ConsultationInput } from './services/secumieConsultationHandoff';
import { createGeneralTurnstileVerifier, createSecumieGeneralRuntime } from './runtime/secumieGeneralRuntime';
import { WscHtmlService } from './services/wscHtmlService';

const kind = process.env.SECUMIE_GENERAL_KIND;
if (kind !== 'WEB' && kind !== 'INSIGHT') throw new Error('SECUMIE_GENERAL_KIND_REQUIRED');
const enabled = process.env.SECUMIE_GENERAL_ENABLED === 'true';
const hostname = process.env.SECUMIE_GENERAL_HOST ?? 'service.atlib.jp';
const siteKey = process.env.SECUMIE_TURNSTILE_SITE_KEY ?? '';
const secret = process.env.SECUMIE_TURNSTILE_SECRET ?? '';
if (enabled && (!siteKey || !secret)) throw new Error('TURNSTILE_CONFIG_REQUIRED');
const required = (name: string): string => {
  const value = process.env[name]; if (!value?.trim()) throw Error('MISSING_CONFIG:' + name); return value;
};
const insightDir = path.resolve(process.cwd(), 'prototypes/pira-union-diagnosis-v2');
function evaluateInsight(answers: NonNullable<ConsultationInput['answers']>): unknown {
  const content = require(path.join(insightDir, 'v6-content.js')) as {versions:{answer:string};questions:Array<{id:string;text:string;options:Array<{id:string;label:string}>}>;themes:Record<string,{title:string}>};
  const engine = require(path.join(insightDir, 'v6.js')) as {evaluate(input:unknown):{answers:typeof answers;priorityThemeIds:string[];ruleSetVersion:string;answerContractVersion:string}};
  const result = engine.evaluate({answerContractVersion:content.versions.answer,answers});
  return {answerContractVersion:result.answerContractVersion,ruleSetVersion:result.ruleSetVersion,answers:result.answers.map(a=>{const q=content.questions.find(q=>q.id===a.questionId)!;return {...a,question:q.text,label:q.options.find(o=>o.id===a.answerId)!.label};}),priorities:result.priorityThemeIds.map(id=>content.themes[id]?.title ?? id)};
}
const handoff = enabled ? (() => {
  const mailer = new Mailer({host:required('SMTP_HOST'),port:587,user:required('SMTP_USER'),password:required('SMTP_PASSWORD'),from:required('SMTP_FROM')});
  const recipient = required('SECUMIE_CONSULTATION_NOTIFY_EMAIL');
  return new ConsultationHandoff(notice=>mailer.sendSecumieConsultationNotification(recipient,notice),SECUMIE_SCHEDULE_URLS[kind],Date.now,7200000,500,evaluateInsight);
})() : undefined;
const app = createSecumieGeneralRuntime({
  kind, hostname, enabled, handoff,
  verify: createGeneralTurnstileVerifier(secret, hostname),
  ...(kind === 'WEB' ? { wsc: new WscHtmlService({technicalHeadings:true}) } : {}),
  assets: {
    pageDir: path.resolve(process.cwd(), 'prototypes/secumie-general'),
    insightDir,
    siteKey,
  },
});
app.listen(Number(process.env.PORT ?? 8080), '0.0.0.0');
