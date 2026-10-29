(() => {
  let directoryHandle = null;
  let pendingSaves = [];
  const $ = id => document.getElementById(id);
  const error = message => { $('error').textContent = message; $('error').style.display = 'block'; };
  const clear = () => { $('error').style.display = 'none'; $('result').style.display = 'none'; };
  const showPending = () => { $('retry-saves').style.display = pendingSaves.length ? 'inline-block' : 'none'; };
  const requireDirectory = async () => {
    if (!directoryHandle) throw new Error('出力先フォルダを選択してください。');
    const permission = await directoryHandle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') throw new Error('出力先フォルダへの保存権限が必要です。');
  };
  const save = async (bytes, filename) => {
    try { await directoryHandle.getFileHandle(filename, { create: false }); throw new Error(`同名のPDFが既にあります：${filename}`); }
    catch (e) { if (e.name !== 'NotFoundError') throw e; }
    const file = await directoryHandle.getFileHandle(filename, { create: true });
    const writable = await file.createWritable(); await writable.write(bytes); await writable.close();
  };
  const requestDiagnosis = async company => {
    const response = await fetch('/api/admin/web-security-check/diagnose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: company.name, url: company.url }) });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || '診断に失敗しました。'); }
    const disposition = response.headers.get('content-disposition') || '';
    const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    const filename = match ? decodeURIComponent(match[1]) : `${company.name}_Webセキュリティ診断レポート.pdf`;
    return { bytes: await response.blob(), filename };
  };
  const diagnoseAndSave = async company => {
    const pdf = await requestDiagnosis(company);
    try { await save(pdf.bytes, pdf.filename); }
    catch (e) { pendingSaves.push(pdf); throw e; }
  };
  $('pick-directory').addEventListener('click', async () => { clear(); try { const selected = await window.showDirectoryPicker({ mode: 'readwrite' }); directoryHandle = selected; $('directory-name').textContent = selected.name; } catch (e) { if (e.name !== 'AbortError') error('出力先を選択できませんでした。'); } });
  $('retry-saves').addEventListener('click', async () => { clear(); try { await requireDirectory(); const remaining = []; for (const pdf of pendingSaves) { try { await save(pdf.bytes, pdf.filename); } catch { remaining.push(pdf); } } pendingSaves = remaining; showPending(); $('result').textContent = pendingSaves.length ? `保存できないPDFが${pendingSaves.length}件あります。` : '保存を完了しました。'; $('result').style.display = 'block'; } catch (e) { error(e.message); } });
  $('single-form').addEventListener('submit', async event => { event.preventDefault(); clear(); try { await requireDirectory(); $('single-form').querySelector('button').disabled = true; await diagnoseAndSave({ name: $('company').value.trim(), url: $('url').value.trim() }); $('result').textContent = 'PDFを保存しました。'; $('result').style.display = 'block'; } catch (e) { error(e.message); showPending(); } finally { $('single-form').querySelector('button').disabled = false; } });
  $('csv-start').addEventListener('click', async () => { clear(); const file = $('csv').files[0]; if (!file) return error('CSVファイルを選択してください。'); try { await requireDirectory(); const source = await file.text(); $('csv-start').disabled = true; $('progress').style.display = 'block'; const validation = await fetch('/api/admin/web-security-check/csv-validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source }) }); const batch = await validation.json(); if (!validation.ok) throw new Error(batch.error || 'CSVを確認できませんでした。'); const failures = batch.errors.map(item => `${item.row}行目: ${item.code}`); if (!batch.companies.length) throw new Error(`有効な診断対象がありません。${failures.join('、')}`); let success = 0; for (let index = 0; index < batch.companies.length; index += 1) { const company = batch.companies[index]; $('progress').textContent = `${index + 1}/${batch.companies.length}件を処理中（成功 ${success}件）`; try { await diagnoseAndSave(company); success += 1; } catch (e) { failures.push(`${company.row}行目: ${e.message}`); } } $('result').textContent = `PDF保存完了：${success}件${failures.length ? `／除外・失敗：${failures.length}件（${failures.join('、')}）` : ''}`; $('result').style.display = 'block'; showPending(); } catch (e) { error(e.message); } finally { $('csv-start').disabled = false; $('progress').style.display = 'none'; } });
})();
