# PIRA受付同意UI Decision (2026-11-01)

SECU:MIE Insightの企業情報受付では同意チェックボックスを使用せず、同意文全文を表示した上で「同意して診断に進む」を押す操作を明示的同意とする。

- APIの `accepted: true`、受付区分に対応する同意版、サーバー生成の同意日時を維持する。
- UNIONは `PIRA-UNION-CONSENT-V1.0`、GENERALは最終承認まで `ATLIB-GENERAL-CONSENT-DRAFT-V0.1` を維持する。
- UNIONの直接営業禁止とGENERALの同意範囲内利用は変更しない。
- 同意文要素が存在し、空でなく、画面上に表示されている場合だけ受付APIへ送信する。
