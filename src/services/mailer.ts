import nodemailer, { type Transporter } from 'nodemailer';
import type { Config } from '../config';
import type { CategoryRecommendation } from '../domain/ismsDiagnostic';

export interface DiagnosticNotificationSummary {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  submittedAt: Date;
  categoryScores: Record<string, number>;
  recommendations: Record<string, CategoryRecommendation>;
  detailUrl: string;
}

export class Mailer {
  private readonly transporter: Transporter;

  async sendItManagementSurveyNotification(to: string, detailUrl: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.from, to, subject: '【無料 IT経営診断】アンケート回答完了 - atLIB株式会社',
      text: `アンケートの回答が完了しました。担当者が管理画面で確認してください。\n${detailUrl}\n\n提供：atLIB株式会社`,
    });
  }

  constructor(private readonly config: Config['smtp']) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: false, // 587 + STARTTLS（Google Workspace SMTPリレーの標準構成）
      auth: {
        user: config.user,
        pass: config.password,
      },
    });
  }

  /** toはカンマ区切りで複数宛先可（nodemailerがそのまま複数宛先として解釈する）。 */
  async sendDiagnosticSubmissionNotification(to: string, summary: DiagnosticNotificationSummary): Promise<void> {
    const scoreLines = Object.entries(summary.categoryScores).map(([categoryId, score]) => `  ${categoryId}: ${score}点`);
    const recommendationLines = Object.entries(summary.recommendations).map(([categoryId, rec]) => {
      const price =
        rec.priceJpy !== undefined
          ? `（パッケージ${rec.packagePriceJpy?.toLocaleString('ja-JP')}円 / 実質負担${rec.priceJpy.toLocaleString('ja-JP')}円）`
          : '';
      const recommendedMark = rec.recommended ? ' ★推奨' : '';
      return `  ${categoryId}: ${rec.label}${recommendedMark}${price}`;
    });

    await this.transporter.sendMail({
      from: this.config.from,
      to,
      subject: `【ISMS診断】新規回答: ${summary.companyName} 様`,
      text: [
        `${summary.companyName} 様より、ISMS支援プラン診断フォームへの回答がありました。`,
        '',
        `会社名: ${summary.companyName}`,
        `担当者: ${summary.contactName}`,
        `メール: ${summary.email}`,
        summary.phone ? `電話番号: ${summary.phone}` : null,
        `送信日時: ${summary.submittedAt.toLocaleString('ja-JP')}`,
        '',
        'カテゴリ別スコア:',
        ...scoreLines,
        '',
        '推奨プラン・判定:',
        ...recommendationLines,
        '',
        `詳細を管理画面で確認: ${summary.detailUrl}`,
      ]
        .filter((line): line is string => line !== null)
        .join('\n'),
    });
  }

  /** 情シスKAIZEN診断（corporate-site LP `/joshisu-kaizen/`）: 見込み客へ診断フォームのURLを送付。 */
  async sendKaizenDiagnosticLinkEmail(to: string, params: { name: string; formUrl: string }): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.from,
      to,
      subject: '情シスKAIZEN診断のご案内 - atLIB株式会社',
      text: [
        `${params.name} 様`,
        '',
        'この度は「atLIB 情シスKAIZEN」無料診断にお申し込みいただき、誠にありがとうございます。',
        '下記URLより、5分程度で回答いただける診断フォームにお進みください。',
        '',
        params.formUrl,
        '',
        'ご回答内容は担当者が確認のうえ、診断結果シートを作成しご連絡いたします。',
        '（フォーム上ではスコアは表示されません）',
        '',
        '※このメールは自動送信されています。',
        '※ご返信いただいてもお答えできませんのでご了承ください。',
      ].join('\n'),
    });
  }

  /** 情シスKAIZEN診断: LPから診断リンクの送付依頼があったことをスタッフへ通知。 */
  async sendKaizenLeadNotification(
    to: string,
    params: { company: string; name: string; email: string; phone?: string },
  ): Promise<void> {
    const lines = [
      '情シスKAIZEN LP（/joshisu-kaizen/）から、診断フォームのURL送付依頼がありました。',
      '',
      `会社名: ${params.company}`,
      `お名前: ${params.name}`,
      `メール: ${params.email}`,
      params.phone ? `電話番号: ${params.phone}` : null,
      '',
      '診断フォームのURLは自動送信済みです。回答があり次第、管理画面の一覧に表示されます。',
    ].filter((line): line is string => line !== null);

    await this.transporter.sendMail({
      from: this.config.from,
      to,
      replyTo: params.email,
      subject: `【情シスKAIZEN LP】診断リンク送付依頼: ${params.company} 様`,
      text: lines.join('\n'),
    });
  }
}
