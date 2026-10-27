(() => {'use strict';
const C=PiraV6Content,V=PiraV6,esc=V.escapeHtml,app=document.getElementById('static-content'),knowledge=document.body.dataset.page==='knowledge';
app.innerHTML=knowledge?Object.values(C.themes).map(t=>'<section class="report-section" id="'+t.id+'"><h2>'+esc(t.title)+'</h2><p>'+esc(t.common)+'</p></section>').join(''):V.materials({priorityThemeIds:[]}).map(m=>'<section class="report-section" data-material="'+m.id+'"><h2>'+esc(m.title)+'</h2><p>'+esc(m.description)+'</p><div class="material-links">'+m.files.map(f=>'<a class="btn secondary" href="'+esc(f.href)+'" target="_blank" rel="noopener">'+esc(f.label)+'</a>').join('')+'</div></section>').join('');
})();
