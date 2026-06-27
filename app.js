/* ====================================================
   MEU REMEDINHO - LÓGICA DO APLICATIVO
   ==================================================== */

// --- ESTADO GLOBAL DA APLICATIVO ---
let state = {
  medicines: [],
  settings: {
    fontSize: 'large', // Padrão: Grande para facilitar a leitura
    soundType: 'soft'  // Padrão: Sino Suave
  }
};

// Variavel temporária para o formulário de adição
let selectedHour = 8;
let selectedMinute = 0;
let selectedFrequency = 1;
let selectedDuration = 'continuous'; // Duração selecionada (continuous ou quantidade de dias)

// Gerenciamento de Áudio (Web Audio API)
let audioCtx = null;
let alarmIntervalId = null;
let isRinging = false;
let currentAlarmMedicine = null;
let currentAlarmTime = null;
let isTestingSound = false;

// Controle de Lembretes disparados para não repetir no mesmo minuto
let lastTriggeredReminders = {}; // Formato: { medicineId_date: true }

// --- DATA E HORA ATUAL FORMATADAS ---
function updateDateTimeDisplay() {
  const dateEl = document.getElementById('current-date');
  const timeEl = document.getElementById('current-time');
  const now = new Date();
  
  if (dateEl) {
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    let dateStr = now.toLocaleDateString('pt-BR', options);
    // Capitalizar primeira letra
    dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    dateEl.textContent = dateStr;
  }
  
  if (timeEl) {
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    timeEl.textContent = `${hours}:${minutes}`;
  }
}

// Obter a chave de data do dia de hoje (ex: "2026-06-26")
function getTodayKey() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Diferença em dias entre duas datas formatadas como AAAA-MM-DD
function getDaysDifference(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1 + 'T00:00:00');
  const d2 = new Date(dateStr2 + 'T00:00:00');
  const diffTime = d2.getTime() - d1.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

// Verificar se o medicamento está ativo em uma data específica
function isMedicineActive(med, dateStr) {
  // Retrocompatibilidade
  if (!med.startDate || !med.duration || med.duration === 'continuous') {
    return true;
  }
  const diff = getDaysDifference(med.startDate, dateStr);
  return (diff >= 0 && diff < med.duration);
}

// Obter todos os horários de um medicamento de acordo com sua frequência
function getMedicineTimes(med) {
  const times = [];
  const parsedTime = med.time.split(':');
  const medHour = parseInt(parsedTime[0]);
  const medMinute = parsedTime[1];
  const interval = Math.floor(24 / med.frequency);
  
  for (let i = 0; i < med.frequency; i++) {
    const h = (medHour + i * interval) % 24;
    times.push(`${String(h).padStart(2, '0')}:${medMinute}`);
  }
  
  return times.sort();
}

// --- PERSISTÊNCIA (LOCALSTORAGE) ---
function loadState() {
  const saved = localStorage.getItem('meu_remedinho_state');
  if (saved) {
    try {
      state = JSON.parse(saved);
      // Garantir compatibilidade de campos antigos se houver
      if (!state.medicines) state.medicines = [];
      if (!state.settings) state.settings = { fontSize: 'large', soundType: 'soft' };
    } catch (e) {
      console.error("Erro ao carregar do localStorage", e);
    }
  } else {
    // Dados de exemplo para o usuário idoso não ver o app completamente vazio de início
    state.medicines = [
      {
        id: 'mock-1',
        name: 'Vitamina D (Gotinhas)',
        time: '08:00',
        frequency: 1,
        history: {}
      },
      {
        id: 'mock-2',
        name: 'Remédio da Pressão',
        time: '12:00',
        frequency: 1,
        history: {}
      }
    ];
    saveState();
  }
}

function saveState() {
  localStorage.setItem('meu_remedinho_state', JSON.stringify(state));
}

// --- GERENCIADOR DE TAMANHO DE FONTE ---
function changeFontSize(size) {
  state.settings.fontSize = size;
  saveState();
  
  // Remover todas as classes de fonte
  document.body.classList.remove('font-size-normal', 'font-size-large', 'font-size-huge');
  
  // Adicionar a classe correspondente
  if (size === 'normal') {
    document.body.classList.add('font-size-normal');
  } else if (size === 'large') {
    document.body.classList.add('font-size-large');
  } else if (size === 'huge') {
    document.body.classList.add('font-size-huge');
  }
  
  // Atualizar visual dos botões na tela de configurações
  document.querySelectorAll('.font-size-options .btn-setting').forEach(btn => {
    btn.classList.remove('active');
  });
  
  const activeBtn = document.getElementById(`font-${size}`);
  if (activeBtn) activeBtn.classList.add('active');
}

// --- GERENCIADOR DE ABA DO APP (SPA) ---
function switchTab(screenId, navElement) {
  // Parar testes de som se o usuário mudar de aba
  if (isTestingSound) {
    toggleTestSound();
  }
  
  // Ocultar todas as telas
  document.querySelectorAll('.screen').forEach(scr => {
    scr.classList.remove('active');
  });
  
  // Exibir a tela selecionada
  const activeScreen = document.getElementById(screenId);
  if (activeScreen) {
    activeScreen.classList.add('active');
  }
  
  // Atualizar navegação visual
  document.querySelectorAll('.app-navigation .nav-item').forEach(item => {
    item.classList.remove('active');
  });
  
  if (navElement) {
    navElement.classList.add('active');
  } else {
    // Se trocado via script, ativar botão manualmente
    const indexMap = {
      'screen-today': 0,
      'screen-add': 1,
      'screen-settings': 2
    };
    const items = document.querySelectorAll('.app-navigation .nav-item');
    const index = indexMap[screenId];
    if (items[index]) {
      items[index].classList.add('active');
    }
  }
  
  // Re-renderizar se for a tela principal
  if (screenId === 'screen-today') {
    renderMedicines();
  }
}

// --- ENCHIMENTO RÁPIDO DO NOME DO REMÉDIO ---
function fillMedName(name) {
  const input = document.getElementById('med-name');
  if (input) {
    input.value = name;
    // Vibrar se suportado
    if (navigator.vibrate) navigator.vibrate(20);
  }
}

// --- CONTROLES DE HORÁRIO (+ / -) ---
function adjustTime(type, amount) {
  if (type === 'hour') {
    selectedHour = (selectedHour + amount + 24) % 24;
    document.getElementById('picker-hour').textContent = String(selectedHour).padStart(2, '0');
  } else if (type === 'minute') {
    selectedMinute = (selectedMinute + amount + 60) % 60;
    document.getElementById('picker-minute').textContent = String(selectedMinute).padStart(2, '0');
  }
  
  // Atualizar pré-visualização dos horários
  updateFrequencyExplanation();
  
  // Vibrar suave
  if (navigator.vibrate) navigator.vibrate(15);
}

// --- SELETOR DE FREQUÊNCIA ---
function selectFrequency(freq) {
  selectedFrequency = freq;
  document.getElementById('med-frequency').value = freq;
  
  // Atualizar botões visuais
  document.querySelectorAll('.frequency-selector .btn-frequency').forEach(btn => {
    btn.classList.remove('active');
  });
  
  const activeBtn = document.querySelector(`.frequency-selector .btn-frequency[data-value="${freq}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  
  // Atualizar pré-visualização dos horários
  updateFrequencyExplanation();
  
  if (navigator.vibrate) navigator.vibrate(20);
}

// --- PRÉ-VISUALIZAÇÃO DOS HORÁRIOS EM TEMPO REAL ---
function updateFrequencyExplanation() {
  const explanation = document.getElementById('frequency-explanation');
  if (!explanation) return;
  
  const freq = selectedFrequency;
  const times = [];
  const interval = Math.floor(24 / freq);
  
  for (let i = 0; i < freq; i++) {
    const h = (selectedHour + i * interval) % 24;
    times.push(`${String(h).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`);
  }
  
  times.sort();
  
  if (freq === 1) {
    explanation.innerHTML = `O alarme tocará no horário: <strong class="preview-time-badge">${times[0]}</strong>`;
  } else {
    const badgesHtml = times.map(t => `<strong class="preview-time-badge">${t}</strong>`).join(' • ');
    explanation.innerHTML = `Os alarmes tocarão em: ${badgesHtml}`;
  }
}

// --- ADICIONAR REMÉDIO E DISPARAR INTERSTICIAL ---
document.getElementById('add-medicine-form').addEventListener('submit', function() {
  const nameInput = document.getElementById('med-name');
  if (!nameInput.value.trim()) return;
  
  const name = nameInput.value.trim();
  const timeStr = `${String(selectedHour).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`;
  
  // Obter duração
  let duration = selectedDuration;
  if (duration === 'custom') {
    const customDaysInput = document.getElementById('custom-duration-days');
    duration = parseInt(customDaysInput.value) || 1;
  }
  
  const newMed = {
    id: 'med-' + Date.now(),
    name: name,
    time: timeStr,
    frequency: selectedFrequency,
    duration: duration,
    startDate: getTodayKey(),
    history: {}
  };
  
  state.medicines.push(newMed);
  saveState();
  
  // Resetar formulário
  nameInput.value = '';
  selectedHour = 8;
  selectedMinute = 0;
  selectedFrequency = 1;
  document.getElementById('picker-hour').textContent = '08';
  document.getElementById('picker-minute').textContent = '00';
  selectFrequency(1);
  selectDuration('continuous'); // Resetar seletor de duração
  
  // Disparar o anúncio intersticial simulado de tela cheia
  showInterstitialAd();
});

// --- RENDERIZAR CARTÕES DE REMÉDIOS NA TELA HOJE ---
function renderMedicines() {
  const container = document.getElementById('medicine-list');
  const badge = document.getElementById('completion-badge');
  if (!container) return;
  
  if (state.medicines.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <!-- Doutorinho (Centralizado) -->
        <div class="mascot-container-doutorinho float-animation">
          <img src="doutorinho.png" alt="Doutorinho" class="mascot-img-large">
        </div>
        
        <!-- Botão de Cadastro Direto -->
        <button type="button" class="btn-primary btn-empty-state-add" onclick="switchTab('screen-add')">
          <span class="btn-plus-icon">+</span> Cadastrar novo remédio
        </button>
      </div>
    `;
    if (badge) badge.textContent = "0 / 0 concluídos";
    return;
  }
  
  const todayKey = getTodayKey();
  const now = new Date();
  const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  // Filtrar remédios ativos hoje vs finalizados
  const activeMedicines = [];
  const finishedMedicines = [];
  
  state.medicines.forEach(med => {
    if (isMedicineActive(med, todayKey)) {
      activeMedicines.push(med);
    } else {
      // Considera finalizado se a data de hoje já passou do período do tratamento
      if (med.startDate && getDaysDifference(med.startDate, todayKey) >= med.duration) {
        finishedMedicines.push(med);
      } else {
        // Se for futuro (ex: fuso horário ou agendamentos), mantém ativo
        activeMedicines.push(med);
      }
    }
  });
  
  // Ordenar ativos e finalizados por horário inicial
  activeMedicines.sort((a, b) => a.time.localeCompare(b.time));
  finishedMedicines.sort((a, b) => a.time.localeCompare(b.time));
  
  let totalDoses = 0;
  let completedDoses = 0;
  let handledDoses = 0;
  
  // Calcular contadores globais de doses (apenas de ativos!)
  activeMedicines.forEach(med => {
    totalDoses += med.frequency;
    const times = getMedicineTimes(med);
    times.forEach(t => {
      const statusKey = `${todayKey}_${t}`;
      const status = med.history[statusKey] || (med.frequency === 1 ? med.history[todayKey] : null);
      if (status === 'taken') {
        completedDoses++;
        handledDoses++;
      } else if (status === 'skipped') {
        handledDoses++;
      }
    });
  });
  
  // Função interna para gerar o HTML do cartão
  function generateMedCardHtml(med, isFinished) {
    const times = getMedicineTimes(med);
    
    // Determinar qual é o próximo alarme no futuro (apenas se ativo)
    let nextSlotTime = null;
    if (!isFinished) {
      for (let i = 0; i < times.length; i++) {
        const t = times[i];
        const statusKey = `${todayKey}_${t}`;
        const status = med.history[statusKey] || (med.frequency === 1 ? med.history[todayKey] : null);
        if (!status && t > currentTimeStr) {
          nextSlotTime = t;
          break;
        }
      }
    }
    
    let slotsHtml = '';
    let medCompletedCount = 0;
    
    times.forEach(t => {
      const statusKey = `${todayKey}_${t}`;
      const status = med.history[statusKey] || (med.frequency === 1 ? med.history[todayKey] : null);
      
      let slotClass = 'med-time-slot';
      let statusLabel = '';
      let actionsHtml = '';
      
      if (status === 'taken') {
        medCompletedCount++;
        slotClass += ' taken';
        statusLabel = '✓ Tomado';
        actionsHtml = `<div class="slot-actions-single"><button class="btn-slot-undo" onclick="undoMedTimeStatus('${med.id}', '${t}')">Desfazer</button></div>`;
      } else if (status === 'skipped') {
        medCompletedCount++;
        slotClass += ' skipped';
        statusLabel = '✗ Pulado';
        actionsHtml = `<div class="slot-actions-single"><button class="btn-slot-undo" onclick="undoMedTimeStatus('${med.id}', '${t}')">Desfazer</button></div>`;
      } else {
        // Sem status
        if (isFinished) {
          slotClass += ' future';
          statusLabel = '📅 Concluído';
        } else {
          if (t <= currentTimeStr) {
            slotClass += ' overdue';
            statusLabel = '⏳ Atrasado';
          } else if (t === nextSlotTime) {
            slotClass += ' next';
            statusLabel = '🔔 Próximo';
          } else {
            slotClass += ' future';
            statusLabel = '📅 Agendado';
          }
          
          actionsHtml = `
            <div class="slot-actions-row">
              <button class="btn-slot-action btn-slot-take" onclick="setMedTimeStatus('${med.id}', '${t}', 'taken')" title="Tomei este remédio">
                ✓ Tomei
              </button>
              <button class="btn-slot-action btn-slot-skip" onclick="setMedTimeStatus('${med.id}', '${t}', 'skipped')" title="Pular este horário">
                ✗ Pular
              </button>
            </div>
          `;
        }
      }
      
      slotsHtml += `
        <div class="${slotClass}">
          <div class="slot-header-row">
            <div class="slot-info">
              <span class="slot-time">${t}</span>
              <span class="slot-status-text">${statusLabel}</span>
            </div>
            ${isFinished ? '' : actionsHtml.includes('slot-actions-single') ? actionsHtml : ''}
          </div>
          ${isFinished ? '' : actionsHtml.includes('slot-actions-row') ? actionsHtml : ''}
        </div>
      `;
    });
    
    let freqText = '1 vez ao dia';
    if (med.frequency > 1) {
      freqText = `${med.frequency} vezes ao dia`;
    }
    
    let durationText = 'Uso contínuo';
    if (med.duration && med.duration !== 'continuous') {
      durationText = `Tratamento de ${med.duration} dias`;
    }
    
    let cardClass = 'medicine-card';
    if (isFinished) {
      cardClass += ' finished';
    } else if (medCompletedCount === med.frequency) {
      cardClass += ' taken';
    }
    
    let overallStatusHtml = '';
    if (isFinished) {
      overallStatusHtml = `<div class="badge-finished">✓ Tratamento Concluído (${med.duration} dias)</div>`;
    } else if (medCompletedCount === med.frequency) {
      overallStatusHtml = `<div class="card-status-label" style="color: var(--color-success); margin-top: 8px;">🎉 Horários de hoje concluídos!</div>`;
    }
    
    return `
      <div class="${cardClass}" id="card-${med.id}">
        <div class="med-header">
          <div class="med-info-header">
            <div class="med-name">${med.name}</div>
            <div class="med-details">${freqText} • ${durationText}</div>
          </div>
          <button class="med-delete-btn" title="Excluir Lembrete" onclick="deleteMedicine('${med.id}')">🗑️</button>
        </div>
        <div class="med-time-slots">
          ${slotsHtml}
        </div>
        ${overallStatusHtml}
        <button class="btn-view-history" onclick="showHistory('${med.id}')">
          📊 Ver Histórico de Tomadas
        </button>
      </div>
    `;
  }
  
  let html = '';
  activeMedicines.forEach(med => {
    html += generateMedCardHtml(med, false);
  });
  
  // Exibir finalizados se houver
  if (finishedMedicines.length > 0) {
    let finishedHtml = `
      <div class="finished-treatments-section">
        <h3 class="finished-section-title">🏁 Tratamentos Concluídos</h3>
    `;
    finishedMedicines.forEach(med => {
      finishedHtml += generateMedCardHtml(med, true);
    });
    finishedHtml += `</div>`;
    html += finishedHtml;
  }
  
  if (handledDoses === totalDoses && totalDoses > 0) {
    const celebrationHtml = `
      <div class="celebration-card">
        <div class="mascots-celebration-row">
          <div class="mascot-container-doutorinho-happy happy-animation">
            <img src="doutorinho.png" alt="Doutorinho" class="mascot-img-medium">
          </div>
          <div class="mascot-container-pill-happy">
            <svg class="mascot-happy" viewBox="0 0 100 120" width="85" height="102" xmlns="http://www.w3.org/2000/svg">
              <g transform="rotate(45 50 50)">
                <path d="M 32,50 L 32,28 A 18,18 0 0,1 68,28 L 68,50 Z" fill="#facc15" />
                <path d="M 32,50 L 32,72 A 18,18 0 0,0 68,72 L 68,50 Z" fill="#ef4444" />
                <line x1="32" y1="50" x2="68" y2="50" stroke="#000000" stroke-width="3" opacity="0.15" />
                <path d="M 37,47 L 37,28 A 13,13 0 0,1 55,15" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" opacity="0.6" />
                <path d="M 63,53 L 63,72 A 13,13 0 0,1 45,85" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" opacity="0.6" />
                <circle cx="42" cy="43" r="3.5" fill="#1e293b" />
                <circle cx="58" cy="43" r="3.5" fill="#1e293b" />
                <circle cx="36" cy="48" r="3" fill="#f43f5e" opacity="0.6" />
                <circle cx="64" cy="48" r="3" fill="#f43f5e" opacity="0.6" />
                <path d="M 46,50 Q 50,54 54,50" fill="none" stroke="#1e293b" stroke-width="2.5" stroke-linecap="round" />
                <path class="mascot-happy-left-arm" d="M 32,58 Q 18,48 22,38" fill="none" stroke="#1e293b" stroke-width="4.5" stroke-linecap="round" transform-origin="32 58" />
                <path class="mascot-happy-right-arm" d="M 68,58 Q 82,48 78,38" fill="none" stroke="#1e293b" stroke-width="4.5" stroke-linecap="round" transform-origin="68 58" />
                <rect x="32" y="10" width="36" height="80" rx="18" fill="none" stroke="#1e293b" stroke-width="6" stroke-linejoin="round" />
              </g>
            </svg>
          </div>
        </div>
        <div>
          <div class="celebration-title">Parabéns! 🎉</div>
          <div class="celebration-desc">Você completou todas as doses de hoje!</div>
        </div>
      </div>
    `;
    html = celebrationHtml + html;
  }
  
  container.innerHTML = html;
  
  if (badge) {
    badge.textContent = `${completedDoses} / ${totalDoses} doses concluídas`;
  }
}

// --- SELETOR DE DURAÇÃO ---
function selectDuration(days) {
  selectedDuration = days;
  document.getElementById('med-duration').value = days;
  
  // Atualizar classe ativa nos botões
  document.querySelectorAll('.duration-selector .btn-duration').forEach(btn => {
    btn.classList.remove('active');
  });
  
  let activeBtn;
  if (days === 'continuous') {
    activeBtn = document.querySelector('.duration-selector .btn-duration[data-value="continuous"]');
  } else if ([3, 5, 7, 10].includes(days)) {
    activeBtn = document.querySelector(`.duration-selector .btn-duration[data-value="${days}"]`);
  } else {
    activeBtn = document.querySelector('.duration-selector .btn-duration[data-value="custom"]');
  }
  
  if (activeBtn) activeBtn.classList.add('active');
  
  // Mostrar/ocultar contêiner de input customizado
  const customContainer = document.getElementById('custom-duration-container');
  if (customContainer) {
    if (days === 'custom') {
      customContainer.classList.remove('hidden');
      document.getElementById('custom-duration-days').required = true;
    } else {
      customContainer.classList.add('hidden');
      document.getElementById('custom-duration-days').required = false;
      document.getElementById('custom-duration-days').value = '';
    }
  }
  
  if (navigator.vibrate) navigator.vibrate(20);
}

// --- MODAL DE HISTÓRICO ---
function showHistory(medId) {
  const med = state.medicines.find(m => m.id === medId);
  if (!med) return;
  
  const container = document.getElementById('history-logs-container');
  const nameEl = document.getElementById('history-med-name');
  const badgeEl = document.getElementById('history-med-badge');
  const overlay = document.getElementById('history-overlay');
  if (!container || !nameEl || !badgeEl || !overlay) return;
  
  nameEl.textContent = med.name;
  
  if (!med.duration || med.duration === 'continuous') {
    badgeEl.textContent = "Uso Contínuo";
  } else {
    badgeEl.textContent = `${med.duration} dias`;
  }
  
  let html = '';
  const today = new Date();
  const times = getMedicineTimes(med);
  
  // Mostrar histórico dos últimos 7 dias de tomadas
  for (let dOffset = 0; dOffset < 7; dOffset++) {
    const checkDate = new Date();
    checkDate.setDate(today.getDate() - dOffset);
    
    const year = checkDate.getFullYear();
    const month = String(checkDate.getMonth() + 1).padStart(2, '0');
    const day = String(checkDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    // Se o remédio ainda não tinha sido iniciado, ignora
    if (med.startDate && getDaysDifference(med.startDate, dateStr) < 0) {
      continue;
    }
    
    // Se o remédio já tinha concluído o tratamento, ignora
    if (med.duration && med.duration !== 'continuous') {
      const diff = getDaysDifference(med.startDate, dateStr);
      if (diff >= med.duration) {
        continue;
      }
    }
    
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    let dateLabel = checkDate.toLocaleDateString('pt-BR', options);
    dateLabel = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
    
    if (dOffset === 0) {
      dateLabel = `Hoje (${dateLabel.split(',')[1] || dateLabel})`;
    } else if (dOffset === 1) {
      dateLabel = `Ontem (${dateLabel.split(',')[1] || dateLabel})`;
    }
    
    let slotsListHtml = '';
    const nowTimeStr = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;
    
    times.forEach(t => {
      const statusKey = `${dateStr}_${t}`;
      const status = med.history[statusKey] || (med.frequency === 1 ? med.history[dateStr] : null);
      
      let statusLabel = '';
      let statusClass = '';
      
      if (status === 'taken') {
        statusLabel = '✓ Tomado';
        statusClass = 'history-status-taken';
      } else if (status === 'skipped') {
        statusLabel = '✗ Pulado';
        statusClass = 'history-status-skipped';
      } else {
        // Se a data é no passado, ou se é hoje mas o horário do alarme já passou, é considerado "Esquecido" (Automático!)
        if (dOffset > 0 || (dOffset === 0 && t <= nowTimeStr)) {
          statusLabel = '✗ Esquecido';
          statusClass = 'history-status-missed';
        } else {
          statusLabel = '⏳ Agendado';
          statusClass = 'history-status-future';
        }
      }
      
      slotsListHtml += `
        <div class="history-slot-line">
          <span class="history-slot-time">⏰ ${t}</span>
          <span class="history-slot-status ${statusClass}">${statusLabel}</span>
        </div>
      `;
    });
    
    html += `
      <div class="history-day-card">
        <div class="history-day-title">${dateLabel}</div>
        <div class="history-slots-list">
          ${slotsListHtml}
        </div>
      </div>
    `;
  }
  
  if (html === '') {
    container.innerHTML = `<p class="no-history-text">Nenhuma dose registrada ainda.</p>`;
  } else {
    container.innerHTML = html;
  }
  
  overlay.classList.remove('hidden');
}

function closeHistory() {
  const overlay = document.getElementById('history-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }
}

// Alterar o status de tomada de um horário específico
function setMedTimeStatus(id, timeStr, status) {
  const todayKey = getTodayKey();
  const med = state.medicines.find(m => m.id === id);
  if (med) {
    const statusKey = `${todayKey}_${timeStr}`;
    med.history[statusKey] = status;
    saveState();
    
    // Feedback de vibração
    if (status === 'taken' && navigator.vibrate) navigator.vibrate([40, 30, 40]);
    if (status === 'skipped' && navigator.vibrate) navigator.vibrate(60);
    
    renderMedicines();
  }
}

// Desfazer o status tomado/pulado de um horário específico
function undoMedTimeStatus(id, timeStr) {
  const todayKey = getTodayKey();
  const med = state.medicines.find(m => m.id === id);
  if (med) {
    const statusKey = `${todayKey}_${timeStr}`;
    delete med.history[statusKey];
    // Retrocompatibilidade
    if (med.frequency === 1) {
      delete med.history[todayKey];
    }
    saveState();
    renderMedicines();
  }
}

// Excluir remédio
function deleteMedicine(id) {
  if (confirm("Deseja mesmo excluir o lembrete deste remédio?")) {
    state.medicines = state.medicines.filter(m => m.id !== id);
    saveState();
    renderMedicines();
  }
}

// --- LIMPAR TODOS OS DADOS ---
function clearAllData() {
  if (confirm("⚠️ CUIDADO! Isso irá apagar todos os remédios cadastrados permanentemente. Deseja continuar?")) {
    state.medicines = [];
    saveState();
    renderMedicines();
    alert("Todos os lembretes foram removidos.");
  }
}

// --- CONFIGURAÇÃO DE SOM ---
function changeSound(sound) {
  state.settings.soundType = sound;
  saveState();
  
  document.querySelectorAll('.sound-options .btn-setting').forEach(btn => {
    btn.classList.remove('active');
  });
  
  const soundBtnMap = {
    'soft': 'sound-soft',
    'loud': 'sound-loud',
    'beep': 'sound-beep'
  };
  
  const activeBtn = document.getElementById(soundBtnMap[sound]);
  if (activeBtn) activeBtn.classList.add('active');
}

// --- SINTETIZADOR DE ÁUDIO WEB (WEB AUDIO API) ---
function initAudio() {
  if (!audioCtx) {
    // Inicia o contexto de audio do navegador
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
}

function playSynthesizedTone(type) {
  initAudio();
  if (!audioCtx) return;
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  const now = audioCtx.currentTime;
  
  if (type === 'soft') {
    // Sino Suave: Onda Senoidal, frequência alta com queda suave
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now); // Nota Lá (A5)
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.4);
    
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
    
    osc.start(now);
    osc.stop(now + 0.8);
  } else if (type === 'loud') {
    // Alarme Alto: Onda Quadrada pulsante de sirene
    osc.type = 'square';
    osc.frequency.setValueAtTime(587.33, now); // Ré (D5)
    osc.frequency.linearRampToValueAtTime(880, now + 0.25);
    osc.frequency.linearRampToValueAtTime(587.33, now + 0.5);
    
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.4);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.5);
    
    osc.start(now);
    osc.stop(now + 0.5);
  } else if (type === 'beep') {
    // Bipe Rápido: Onda Dente de Serra curta e aguda
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1200, now);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    
    osc.start(now);
    osc.stop(now + 0.15);
  }
}

function startAlarmAudioLoop(type) {
  stopAlarmAudioLoop(); // Prevenir múltiplos loops
  
  let delay = 1000;
  if (type === 'beep') delay = 350;
  if (type === 'loud') delay = 600;
  
  isRinging = true;
  
  // Tocar imediatamente o primeiro bipe
  playSynthesizedTone(type);
  
  // Configurar loop de áudio contínuo
  alarmIntervalId = setInterval(() => {
    if (isRinging) {
      playSynthesizedTone(type);
    }
  }, delay);
}

function stopAlarmAudioLoop() {
  isRinging = false;
  if (alarmIntervalId) {
    clearInterval(alarmIntervalId);
    alarmIntervalId = null;
  }
}

// Testar som da aba Opções
function toggleTestSound() {
  const btn = document.getElementById('btn-test-sound');
  if (!btn) return;
  
  if (isTestingSound) {
    stopAlarmAudioLoop();
    isTestingSound = false;
    btn.textContent = "🔊 Testar Som";
    btn.classList.remove('btn-danger');
  } else {
    initAudio();
    isTestingSound = true;
    btn.textContent = "⏹ Parar Teste";
    btn.classList.add('btn-danger');
    startAlarmAudioLoop(state.settings.soundType);
  }
}

// --- PROCESSO DE DETECÇÃO DE ALARMES ---
function startAlarmCheckingInterval() {
  // Checagem a cada 5 segundos para economizar recursos e ser precisa no minuto
  setInterval(() => {
    if (isRinging || isTestingSound) return; // Se já está tocando, ignora
    
    const now = new Date();
    const currentHour = String(now.getHours()).padStart(2, '0');
    const currentMinute = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${currentHour}:${currentMinute}`;
    const todayKey = getTodayKey();
    
    state.medicines.forEach(med => {
      // Só dispara alarme se o remédio estiver ativo hoje!
      if (!isMedicineActive(med, todayKey)) return;
      
      const times = getMedicineTimes(med);
      
      times.forEach(checkTime => {
        if (checkTime === currentTime) {
          // Chave única para controle de disparo único por minuto
          const triggerKey = `${med.id}_${todayKey}_${currentTime}`;
          
          if (lastTriggeredReminders[triggerKey]) return; // Já disparou este minuto
          
          // Checar se este slot de horário já foi tomado/pulado hoje
          const statusKey = `${todayKey}_${checkTime}`;
          const slotStatus = med.history[statusKey] || (med.frequency === 1 ? med.history[todayKey] : null);
          
          if (!slotStatus) {
            lastTriggeredReminders[triggerKey] = true; // Marcar como disparado
            triggerAlarmOverlay(med, checkTime);
          }
        }
      });
    });
  }, 5000);
}

function triggerAlarmOverlay(med, timeStr) {
  currentAlarmMedicine = med;
  currentAlarmTime = timeStr;
  
  // Preencher dados na tela de alarme
  document.getElementById('alarm-medicine-name').textContent = med.name;
  document.getElementById('alarm-medicine-time').textContent = timeStr;
  
  // Exibir a sobreposição de alarme
  const alarmOverlay = document.getElementById('alarm-ring-overlay');
  if (alarmOverlay) {
    alarmOverlay.classList.remove('hidden');
  }
  
  // Tocar som em loop
  startAlarmAudioLoop(state.settings.soundType);
  
  // Vibrar padrão contínuo se disponível
  if (navigator.vibrate) {
    navigator.vibrate([500, 200, 500, 200, 500]);
  }
}

// Resolver o alarme diretamente do modal
function resolveAlarmFromOverlay(action) {
  if (!currentAlarmMedicine || !currentAlarmTime) return;
  
  // Parar som e ocultar overlay
  stopAlarmAudioLoop();
  
  const alarmOverlay = document.getElementById('alarm-ring-overlay');
  if (alarmOverlay) {
    alarmOverlay.classList.add('hidden');
  }
  
  // Mapear 'take' -> 'taken' e 'skip' -> 'skipped' para compatibilidade com o histórico
  const status = action === 'take' ? 'taken' : (action === 'skip' ? 'skipped' : action);
  
  // Definir status do remédio para aquele horário específico
  setMedTimeStatus(currentAlarmMedicine.id, currentAlarmTime, status);
  currentAlarmMedicine = null;
  currentAlarmTime = null;
}

// --- ESTRUTURA E SIMULAÇÃO DE ANÚNCIOS ---

// 1. Banner de Rodapé Simulado
const mockBanners = [
  "Drogaria Pague Menos: Desconto de até 30% em vitaminas! Ver ofertas.",
  "Ultrafarma: Compre seu remédio de pressão com entrega rápida. Clique aqui.",
  "Hospital Sancta Maggiore: Dicas de saúde para viver melhor. Saiba mais.",
  "Drogasil: Cadastre sua receita e ganhe frete grátis nas compras online."
];

function rotateBannerAd() {
  const textEl = document.getElementById('ad-content-text');
  if (!textEl) return;
  
  const randomIndex = Math.floor(Math.random() * mockBanners.length);
  textEl.textContent = mockBanners[randomIndex];
}

function dismissMockBanner() {
  const banner = document.querySelector('.admob-banner-container');
  const content = document.querySelector('.app-content');
  if (banner) {
    banner.classList.add('hidden');
  }
  if (content) {
    content.style.paddingBottom = '90px'; // Reduz padding sem o banner
  }
}

// 2. Intersticial Simulado
let countdownInterval = null;

function showInterstitialAd() {
  // Garantir que não está tocando alarme para não confundir o idoso
  if (isRinging) return;
  
  const overlay = document.getElementById('admob-interstitial');
  const closeBtn = document.getElementById('interstitial-close-btn');
  if (!overlay || !closeBtn) {
    // Caso falte os elementos de anúncios, pula para a tela principal diretamente
    switchTab('screen-today');
    return;
  }
  
  // Resetar estado do botão de fechar
  closeBtn.disabled = true;
  closeBtn.textContent = "Aguarde (3s)";
  closeBtn.classList.remove('active');
  
  // Mostrar overlay
  overlay.classList.remove('hidden');
  
  let countdown = 3;
  
  // Limpar intervalo anterior se houver
  if (countdownInterval) clearInterval(countdownInterval);
  
  countdownInterval = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      closeBtn.textContent = `Aguarde (${countdown}s)`;
    } else {
      clearInterval(countdownInterval);
      closeBtn.disabled = false;
      closeBtn.textContent = "❌ Fechar Anúncio";
      closeBtn.classList.add('active');
    }
  }, 1000);
}

function closeInterstitial() {
  const overlay = document.getElementById('admob-interstitial');
  if (overlay) {
    overlay.classList.add('hidden');
  }
  
  // Redireciona para a tela inicial após o anúncio ser fechado
  switchTab('screen-today');
}

function openMockAdUrl() {
  alert("Simulando clique no anúncio: Isso direcionaria o usuário para a loja ou WhatsApp do patrocinador no app real.");
  closeInterstitial();
}

// --- EVENTOS DE INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
  // Carregar dados salvos
  loadState();
  
  // Aplicar tamanho da fonte
  changeFontSize(state.settings.fontSize);
  
  // Aplicar som configurado nos botões visuais
  changeSound(state.settings.soundType);
  
  // Configurar e atualizar data e hora no cabeçalho
  updateDateTimeDisplay();
  setInterval(updateDateTimeDisplay, 1000); // Atualizar a cada segundo
  
  // Renderizar remédios
  renderMedicines();
  
  // Inicializar pré-visualização de horários de cadastro
  updateFrequencyExplanation();
  
  // Iniciar checagem de alarmes em segundo plano
  startAlarmCheckingInterval();
  
  // Iniciar rotação de anúncios de rodapé
  rotateBannerAd();
  setInterval(rotateBannerAd, 15000); // Muda anúncio a cada 15 segundos
  
  // Listener genérico de cliques para ativar a Web Audio API (requisito dos navegadores)
  document.body.addEventListener('click', () => {
    initAudio();
  }, { once: true });

  // Registrar Service Worker para PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('Service Worker registrado com sucesso!'))
      .catch((err) => console.log('Erro ao registrar Service Worker:', err));
  }
});
