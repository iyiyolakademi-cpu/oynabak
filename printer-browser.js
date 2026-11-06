/* OynaBak web printing console.
 * No local executable. Browser printing needs operator confirmation.
 * A network transfer / print dialog cannot prove paper was physically printed.
 */
(() => {
  'use strict';
  const endpoint = 'https://qacmubkcierbpxmdtsph.supabase.co/rest/v1/rpc/';
  const apiKey = 'sb_publishable_RU5vtZxlqK2dMD-LWuwUaA_Eak6b9cj';
  const $ = id => document.getElementById(id);
  let deviceToken = '';
  let refreshing = false;
  let activeJob = null;
  let testOnly = false;
  let printPromptOpened = false;
  let currentSettings = null;

  function alertText(message, type = 'error') {
    $('alert').textContent = message;
    $('alert').style.color = type === 'ok' ? '#187443' : '#a62931';
  }

  async function rpc(name, payload) {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15000);
    try {
      const result = await fetch(endpoint + name, {
        method: 'POST',
        cache: 'no-store',
        headers: { apikey: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abort.signal
      });
      if (!result.ok) {
        throw new Error('Sunucu bağlantısı başarısız (HTTP ' + result.status + ').');
      }
      return result.json();
    } finally { clearTimeout(timeout); }
  }

  function setText(id, text) { $(id).textContent = String(text ?? '—'); }
  function formatTime(value) {
    if (!value) return '—';
    const t = new Date(value);
    return Number.isNaN(t.getTime()) ? '—' : new Intl.DateTimeFormat('tr-TR', {
      day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'
    }).format(t);
  }
  function orderStatus(code) {
    return ({
      pending:'Bekliyor',
      printing:'Kontrol gerekli',
      printed:'Gönderildi',
      failed:'Hata'
    })[code] || 'Bilinmiyor';
  }

  function applyOverview(data) {
    if (!data || typeof data !== 'object') throw new Error('Bu cihaz anahtarı doğrulanamadı veya iptal edilmiş.');
    currentSettings = data;
    setText('venue', data.venue_id || 'İşletme');
    setText('device', data.device_name || 'Eşleştirilmiş yazıcı cihazı');
    const active = Boolean(data.enabled && data.auto_print);
    setText('auto-state', active ? 'Kuyruk etkin' : 'Kuyruk kapalı');
    setText('state', 'İşletme bağlandı');
    $('state').classList.remove('muted-pill');
    setText('printed', data.summary?.printed_today ?? 0);
    setText('pending', data.summary?.pending ?? 0);
    setText('failed', data.summary?.failed ?? 0);
    setText('review', data.summary?.review ?? 0);
    $('claim').disabled = !active || Boolean(activeJob);
    const rows = $('rows');
    rows.replaceChildren();
    const recent = Array.isArray(data.recent) ? data.recent : [];
    if (!recent.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4; cell.textContent = 'Henüz yazdırma kaydı bulunmuyor.';
      row.appendChild(cell); rows.appendChild(row);
    }
    for (const job of recent) {
      const row = document.createElement('tr');
      const items = Array.isArray(job.items) ? job.items : [];
      const fields = [
        formatTime(job.created_at),
        String(job.table_no ?? '—'),
        items.map(it => String(it.quantity ?? '1') + '× ' + String(it.name ?? 'Ürün')).join(', ') || '—',
        orderStatus(job.status)
      ];
      for (const value of fields) {
        const cell = document.createElement('td');
        cell.textContent = value.slice(0, 240);
        row.appendChild(cell);
      }
      if (job.last_error) row.title = String(job.last_error).slice(0, 160);
      rows.appendChild(row);
    }
    setText('updated', 'Son güncelleme: ' + new Date().toLocaleTimeString('tr-TR') +
      ' · 12 saniyede bir yenilenir');
  }

  async function refresh() {
    if (!deviceToken || refreshing) return;
    refreshing = true;
    $('refresh').disabled = true;
    try {
      const data = await rpc('ob_print_device_overview', { p_token: deviceToken });
      applyOverview(data);
    } catch (error) {
      alertText(error.message || 'İşletmeye ulaşılamadı.');
      setText('state','Bağlantı sorunu');
    } finally {
      refreshing = false; $('refresh').disabled = false;
    }
  }

  async function pair() {
    const token = $('token').value.trim();
    if (!/^obp_[a-f0-9]{64}$/.test(token)) {
      alertText('Geçerli cihaz anahtarını yönetici panelinden kopyalayın.');
      return;
    }
    $('pair').disabled = true;
    try {
      const data = await rpc('ob_print_device_overview', { p_token: token });
      if (!data || !data.venue_id) throw new Error('Cihaz anahtarı tanınmıyor veya iptal edilmiş.');
      deviceToken = token;
      $('token').value = '';
      $('pairing').hidden = true;
      $('business').hidden = false;
      applyOverview(data);
      alertText('Gerçek işletme verilerine güvenli bağlantı kuruldu.', 'ok');
    } catch(error) {
      alertText(error.message || 'Bağlantı kurulamadı.');
    } finally { $('pair').disabled = false; }
  }

  function disconnect() {
    if (activeJob) {
      alertText('Üzerinde işlem yapılan fişi önce doğrulayın. Belirsiz baskı için yönetici panelini kontrol edin.');
      return;
    }
    deviceToken = '';
    currentSettings = null;
    $('business').hidden = true; $('pairing').hidden = false;
    setText('state','Bağlantı bekleniyor');
    $('state').classList.add('muted-pill');
    alertText('Cihaz bağlantısı kapatıldı.', 'ok');
  }

  function label(text, cls = '') {
    const p = document.createElement('div');
    if (cls) p.className = cls;
    p.textContent = String(text);
    return p;
  }

  function renderReceipt(data, isTest = false) {
    const area = $('receipt'); area.replaceChildren();
    area.appendChild(label(isTest ? 'OYNABAK · YAZICI TESTİ' : 'OYNABAK', 'center'));
    area.appendChild(label(isTest ? 'TEST FİŞİ — SİPARİŞ DEĞİLDİR' : 'MUTFAK SİPARİŞİ', 'center'));
    area.appendChild(label('', 'rule'));
    area.appendChild(label('Tarih: ' + new Date().toLocaleString('tr-TR')));
    area.appendChild(label('MASA ' + String(data.table_no ?? '—').slice(0, 12), 'big'));
    area.appendChild(label('', 'rule'));
    let any = false;
    for (const product of (Array.isArray(data.items) ? data.items : [])) {
      const qty = Number(product.quantity);
      if (!Number.isInteger(qty) || qty < 1 || qty > 999) continue;
      const name = String(product.name ?? '').slice(0, 160);
      if (!name) continue;
      any = true;
      area.appendChild(label(qty + ' × ' + name, 'item'));
      const extra = String(product.variant_name ?? '').slice(0, 140);
      if (extra) area.appendChild(label('  ' + extra));
      const note = String(product.note ?? '').slice(0, 250);
      if (note) area.appendChild(label('NOT: ' + note, 'note'));
    }
    if (!any && !isTest) throw new Error('Yazdırılabilecek ürün bulunamadı.');
    const orderNote = String(data.customer_note ?? '').slice(0, 360);
    if (orderNote) {
      area.appendChild(label('', 'rule'));
      area.appendChild(label('SİPARİŞ NOTU: ' + orderNote,'note'));
    }
    area.appendChild(label('', 'rule'));
    area.appendChild(label(isTest ? 'FİZİKSEL TEST ÇIKTISI' : 'SİPARİŞİ HAZIRLAYIN','footer'));
  }

  function openModal(title, isTest) {
    testOnly = isTest;
    printPromptOpened = false;
    setText('print-heading', title);
    setText('print-context', isTest
      ? 'Yazıcı sürücüsünün gerçekten yazdırdığını kontrol edin.'
      : 'Bu fiş sunucuda yazdırılıyor olarak işaretlendi. Kâğıda çıkınca onaylayın.');
    $('confirm').hidden = true;
    $('print-warning').textContent = isTest
      ? 'Bu yalnızca fiziksel yazıcı testi içindir; gerçek sipariş oluşturmaz.'
      : 'Yanlışlıkla kapatırsanız fişi tekrar basmayın. Yönetici panelinden kontrol edin.';
    $('print-modal').hidden = false;
  }

  async function claimNext() {
    if (activeJob || !deviceToken || !currentSettings?.enabled || !currentSettings?.auto_print) return;
    $('claim').disabled = true;
    try {
      const job = await rpc('ob_print_claim', { p_token: deviceToken });
      if (!job) {
        alertText('Şu anda yazdırma kuyruğunda uygun bekleyen sipariş yok.', 'ok');
        return;
      }
      activeJob = job;
      if (!job.id || !job.claim_id || !job.payload) throw new Error('İşlem bilgileri eksik. Yönetici kontrolü gerekiyor.');
      renderReceipt(job.payload);
      openModal('Masa ' + String(job.payload.table_no ?? '—') + ' · Gerçek sipariş', false);
      alertText('Sipariş hazırlandı. Windows yazdırma penceresinden fişi yazdırın.', 'ok');
    } catch (error) {
      alertText('Sipariş hazırlanamıyor: ' + error.message + (activeJob
        ? ' Baskı belirsiz kaldı; yönetici panelinden inceleyin.' : ''));
    } finally {
      if (!activeJob) $('claim').disabled = false;
    }
  }

  async function confirmPrint() {
    if (!activeJob || !printPromptOpened || !deviceToken) return;
    $('confirm').disabled = true;
    try {
      const ok = await rpc('ob_print_finish', {
        p_token: deviceToken, p_job_id: activeJob.id,
        p_claim_id: activeJob.claim_id, p_outcome: 'printed', p_error: ''
      });
      if (ok !== true) throw new Error('Sunucu fişin tamamlandığını onaylamadı.');
      activeJob = null;
      $('print-modal').hidden = true;
      alertText('Fiş fiziksel çıktı olarak işletme tarafından onaylandı.', 'ok');
      await refresh();
    } catch (error) {
      alertText('Baskı doğrulaması kaydedilemedi: ' + error.message +
        '. Tekrar fiş basmayın; yönetici panelinden kontrol edin.');
    } finally { $('confirm').disabled = false; }
  }

  function printNow() {
    if ($('print-modal').hidden) return;
    printPromptOpened = true;
    if (!testOnly) $('confirm').hidden = false;
    window.print();
  }

  function closeModal() {
    if (activeJob) {
      if (!window.confirm('Bu siparişin çıktısı henüz onaylanmadı. Kapatırsanız baskı inceleme gerektirecek. Kapatılsın mı?'))
        return;
      activeJob = null;
      alertText('Baskı doğrulanmadı. Yeniden basmadan önce yönetici panelinden kontrol edin.');
    }
    $('print-modal').hidden = true;
    if (deviceToken) refresh();
  }

  $('pair').addEventListener('click', pair);
  $('token').addEventListener('keydown', event => { if (event.key === 'Enter') pair(); });
  $('disconnect').addEventListener('click',disconnect);
  $('refresh').addEventListener('click',refresh);
  $('claim').addEventListener('click',claimNext);
  $('test').addEventListener('click',() => {
    try {
      renderReceipt({
        table_no: 'TEST',
        items: [{ name:'Türkçe karakter: Ç Ğ İ Ö Ş Ü ç ğ ı ö ş ü',quantity:1 }],
        customer_note:'Yazıcıdan fiziksel olarak çıktığını kontrol edin.'
      },true);
      openModal('Fiziksel yazıcı test fişi',true);
    } catch(error) {alertText(error.message);}
  });
  $('print-now').addEventListener('click',printNow);
  $('confirm').addEventListener('click',confirmPrint);
  $('close-modal').addEventListener('click',closeModal);
  setInterval(() => {if(deviceToken && !activeJob && !$('print-modal').hidden === false)refresh();},12000);
  window.addEventListener('beforeunload',event => {
    if (!activeJob) return;
    event.preventDefault();
    event.returnValue = '';
  });
})();