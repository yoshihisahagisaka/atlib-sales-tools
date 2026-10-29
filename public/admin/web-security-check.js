(() => {
  let directoryHandle = null;
  const $ = id => document.getElementById(id);
  const error = message => { $('error').textContent = message; $('error').style.display = 'block'; };
  const clear = () => { $('error').style.display = 'none'; $('result').style.display = 'none'; };
  const requireDirectory = async () => {
    if (!directoryHandle) throw new Error('出力先フォルダを選択してください。');
    const permission = await directoryHandle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') throw new Error('出力先フォルダへの保存権限が必要です。');
  };
  const save = async (bytes, filename) => {
    const file = await directoryHandle.getFileHandle(filename, { create: false }).catch(() => directoryHandle.getFileHandle(filename, { create: true }));
    const writable = await file.createWritable(); await writable.write(bytes); await writable.close();
  };
  const diagnose = async company => {
    const response = await fetch('/api/admin/web-security-check/diagnose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: company.name, url: company.url }) });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || '診断に失敗しました。'); }
    const disposition = response.headers.get('content-disposition') || '';
    const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    const filename = match ? decodeURIComponent(match[1]) : `${company.name}_Webセキュリティ診断レポート.pdf`;
    await save(await response.blob(), filename);
  };
  $('pick-directory').addEventListener('click', async () => { clear(); try { const selected = await window.showDirectoryPicker({ mode: 'readwrite' }); directoryHandle = selected; $('directory-name').textContent = selected.name; } catch (e) { if (e.name !== 'AbortError') error('出力先を選択できませんでした。'); } });
  $('single-form').addEventListener('submit', async event => { event.preventDefault(); clear(); try { await requireDirectory(); $('single-form').querySelector('button').disabled = true; await diagnose({ name: $('company').value.trim(), url: $('url').value.trim() }); $('result').textContent = 'PDFを保存しました。'; $('result').style.display = 'block'; } catch (e) { error(e.message); } finally { $('single-form').querySelector('button').disabled = false; } });
  const splitLines = text => text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n').filter((line, index, lines) => line !== '' || index !== lines.length - 1);
  $('csv-start').addEventListener('click', async () => { clear(); const file = $('csv').files[0]; if (!file) return error('CSVファイルを選択してください。'); try { await requireDirectory(); const lines = splitLines(await file.text()); if (lines.length < 2) throw new Error('CSVに診断対象がありません。'); const header = lines[0]; $('csv-start').disabled = true; $('progress').style.display = 'block'; let success = 0; const failures = []; for (let index = 1; index < lines.length; index += 1) { $('progress').textContent = `${index}/${lines.length - 1}件を処理中（成功 ${success}件）`; const parsed = await fetch('/api/admin/web-security-check/csv-row', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ header, row: lines[index] }) }); const body = await parsed.json(); if (!parsed.ok) { failures.push(`${index + 1}行目: ${body.error || '入力エラー'}`); continue; } try { await diagnose(body.company); success += 1; } catch (e) { failures.push(`${index + 1}行目: ${e.message}`); } } $('result').textContent = `PDF保存完了：${success}件${failures.length ? `／失敗：${failures.length}件（${failures.join('、')}）` : ''}`; $('result').style.display = 'block'; } catch (e) { error(e.message); } finally { $('csv-start').disabled = false; $('progress').style.display = 'none'; } });
})();
