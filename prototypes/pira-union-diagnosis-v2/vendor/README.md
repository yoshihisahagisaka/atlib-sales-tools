# ローカルPDF用の同梱資産

- `pdf-lib.min.js`：PDF-lib 1.17.1、MIT。PDFオブジェクト生成・保存を再利用。ライセンスはPDF-LIB-LICENSE.md。
- `pdf-font.js`：Noto Sans JPの必要字形・文字幅・CID対応表。外部フォント読み込みなし。
- `PiraNotoSansJP.ttf`：上記と同じサブセット原本。SIL Open Font License 1.1、NOTO-OFL.txt参照。

Noto Sans JPは開発環境の `NotoSansJP-VF.ttf`（weight 400）から必要字形を抽出。フォントを含むPDFの作成はブラウザ内だけで行います。文字を追加する場合は開発時にサブセットを再生成し、全ケースのPDFを検証してください。利用者による追加インストールは不要です。

ライセンス照合先： https://github.com/google/fonts/blob/main/ofl/notosansjp/OFL.txt

`phase3-pdf.js` は共通表示モデルからPDF-libの既存オブジェクトAPIへ渡すアダプターです。サーバー・専用PDFサービス・商用生成基盤は設けていません。
