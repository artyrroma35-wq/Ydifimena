(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORAGE_KEY = 'tihe-orbita.v1';
  const DAY_NOTES = [
    'Незаконченный список — не обещание.',
    'Не нужно заслуживать право на паузу.',
    'Маленький шаг тоже меняет орбиту.',
    'Сначала присутствуй. Потом продуктивничай.',
    'Можно делать меньше — и всё равно идти вперёд.',
    'Ты — не список задач, который несёшь с собой.'
  ];
  const STARTER_TASKS = [
    { id: 'starter-1', text: 'Выбрать главное на сегодня', completed: false },
    { id: 'starter-2', text: 'Дать себе 25 минут фокуса', completed: false },
    { id: 'starter-3', text: 'Оставить время для прогулки', completed: false }
  ];
  const POINTS = [
    { x: 150, y: 137 }, { x: 334, y: 76 }, { x: 526, y: 145 },
    { x: 236, y: 207 }, { x: 455, y: 205 }, { x: 613, y: 76 },
    { x: 83, y: 72 }, { x: 350, y: 169 }, { x: 582, y: 216 },
    { x: 194, y: 54 }, { x: 405, y: 49 }, { x: 282, y: 124 }
  ];
  const SKIES = [
    { id: 'aurora', label: 'Аврора' },
    { id: 'moon', label: 'Луна' },
    { id: 'ember', label: 'Сумерки' }
  ];
  const PRESETS = [15, 25, 45, 60];
  const CIRCUMFERENCE = 2 * Math.PI * 103;

  const dom = {
    todayDate: $('#todayDate'),
    heroDone: $('#heroDone'),
    heroTotal: $('#heroTotal'),
    heroProgress: $('.daily-progress-track'),
    heroProgressBar: $('#heroProgressBar'),
    heroProgressHint: $('#heroProgressHint'),
    mapTaskCount: $('#mapTaskCount'),
    constellation: $('#constellation'),
    constellationTrail: $('#constellationTrail'),
    constellationNodes: $('#constellationNodes'),
    taskList: $('#taskList'),
    addTaskForm: $('#addTaskForm'),
    newTaskInput: $('#newTaskInput'),
    focusPanel: $('.focus-panel'),
    timerVisual: $('#timerVisual'),
    timerTime: $('#timerTime'),
    timerProgress: $('#timerProgress'),
    timerStatus: $('#timerStatus'),
    timerOverline: $('#timerOverline'),
    timerSubline: $('#timerSubline'),
    timerStart: $('#timerStart'),
    timerStartLabel: $('#timerStartLabel'),
    timerReset: $('#timerReset'),
    focusTaskName: $('#focusTaskName'),
    clearFocus: $('#clearFocus'),
    sessionsToday: $('#sessionsToday'),
    focusMinutesToday: $('#focusMinutesToday'),
    dailyNote: $('#dailyNote'),
    skyButton: $('#skyButton'),
    skyLabel: $('#skyLabel'),
    soundButton: $('#soundButton'),
    soundLabel: $('#soundLabel'),
    toast: $('#toast'),
    breathButton: $('#breathButton'),
    breathOverlay: $('#breathOverlay'),
    breathDialog: $('.breath-dialog'),
    breathClose: $('#breathClose'),
    breathStart: $('#breathStart'),
    breathOrbit: $('#breathOrbit'),
    breathPhase: $('#breathPhase'),
    breathCountdown: $('#breathCountdown'),
    breathRound: $('#breathRound')
  };

  function localDayKey(date = new Date()) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }

  function makeId() {
    return globalThis.crypto?.randomUUID?.() || `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function freshState() {
    return {
      dayKey: localDayKey(),
      tasks: STARTER_TASKS.map(task => ({ ...task })),
      selectedTaskId: STARTER_TASKS[0].id,
      duration: 25,
      remainingSeconds: 25 * 60,
      deadline: null,
      isRunning: false,
      sessions: 0,
      focusMinutes: 0,
      sky: 'aurora'
    };
  }

  function loadState() {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch {
      saved = null;
    }

    if (!saved || saved.dayKey !== localDayKey()) return freshState();

    const next = freshState();
    if (Array.isArray(saved.tasks)) {
      next.tasks = saved.tasks
        .filter(task => task && typeof task.id === 'string' && typeof task.text === 'string')
        .slice(0, 12)
        .map(task => ({ id: task.id, text: task.text.slice(0, 72), completed: Boolean(task.completed) }));
    }
    if (saved.selectedTaskId === null) {
      next.selectedTaskId = null;
    } else {
      next.selectedTaskId = typeof saved.selectedTaskId === 'string'
        ? saved.selectedTaskId
        : next.tasks.find(task => !task.completed)?.id || null;
    }
    if (![...PRESETS].includes(Number(saved.duration))) next.duration = 25;
    else next.duration = Number(saved.duration);
    next.remainingSeconds = Number.isFinite(Number(saved.remainingSeconds))
      ? Math.max(0, Math.min(next.duration * 60, Math.floor(Number(saved.remainingSeconds))))
      : next.duration * 60;
    next.sessions = Math.max(0, Math.floor(Number(saved.sessions) || 0));
    next.focusMinutes = Math.max(0, Math.floor(Number(saved.focusMinutes) || 0));
    next.sky = SKIES.some(sky => sky.id === saved.sky) ? saved.sky : 'aurora';

    if (saved.isRunning && Number.isFinite(Number(saved.deadline))) {
      const left = Math.ceil((Number(saved.deadline) - Date.now()) / 1000);
      next.remainingSeconds = Math.max(0, Math.min(next.duration * 60, left));
      next.isRunning = left > 0;
      next.deadline = left > 0 ? Number(saved.deadline) : null;
    }

    const selected = next.tasks.find(task => task.id === next.selectedTaskId && !task.completed);
    if (next.selectedTaskId !== null && !selected) next.selectedTaskId = next.tasks.find(task => !task.completed)?.id || null;
    return next;
  }

  const state = loadState();
  let timerInterval = null;
  let toastTimeout = null;
  let audioContext = null;
  let ambientGain = null;
  let ambientOn = false;
  let breathInterval = null;
  let breathStartedAt = 0;
  let breathState = 'ready';
  let lastBreathTrigger = null;

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
    } catch {
      // The app remains usable when browser storage is unavailable.
    }
  }

  function showToast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add('is-visible');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => dom.toast.classList.remove('is-visible'), 2700);
  }

  function getDoneCount() {
    return state.tasks.filter(task => task.completed).length;
  }

  function renderDate() {
    const now = new Date();
    const formatted = new Intl.DateTimeFormat('ru-RU', {
      weekday: 'long', day: 'numeric', month: 'long'
    }).format(now);
    dom.todayDate.textContent = formatted.toLocaleUpperCase('ru-RU');
    const days = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 86400000);
    dom.dailyNote.textContent = DAY_NOTES[((days % DAY_NOTES.length) + DAY_NOTES.length) % DAY_NOTES.length];
  }

  function renderProgress() {
    const done = getDoneCount();
    const total = state.tasks.length;
    dom.heroDone.textContent = String(done).padStart(2, '0');
    dom.heroTotal.textContent = String(total).padStart(2, '0');
    dom.mapTaskCount.textContent = String(total).padStart(2, '0');
    dom.heroProgressBar.style.width = `${total ? (done / total) * 100 : 0}%`;
    dom.heroProgress.setAttribute('aria-valuemax', String(Math.max(total, 1)));
    dom.heroProgress.setAttribute('aria-valuenow', String(done));
    if (!total) dom.heroProgressHint.textContent = 'День начинается там, где ты.';
    else if (done === total) dom.heroProgressHint.textContent = 'На сегодня достаточно. Хорошо.';
    else if (done > 0) dom.heroProgressHint.textContent = 'Хорошее начало. Не спеши.';
    else dom.heroProgressHint.textContent = 'Можно начать с любой.';
  }

  function renderTasks() {
    dom.taskList.replaceChildren();

    if (!state.tasks.length) {
      const empty = document.createElement('div');
      empty.className = 'task-empty';
      const strong = document.createElement('strong');
      strong.textContent = 'Чистое небо.';
      const text = document.createElement('span');
      text.textContent = 'Добавь одну вещь, которой хочется уделить внимание.';
      empty.append(strong, text);
      dom.taskList.append(empty);
      return;
    }

    state.tasks.forEach((task, index) => {
      const row = document.createElement('div');
      row.className = 'task-row';
      if (task.id === state.selectedTaskId) row.classList.add('is-selected');
      if (task.completed) row.classList.add('is-complete');
      row.style.animationDelay = `${Math.min(index * 35, 210)}ms`;

      const pick = document.createElement('button');
      pick.className = 'task-pick';
      pick.type = 'button';
      pick.setAttribute('aria-pressed', String(task.id === state.selectedTaskId));
      pick.setAttribute('aria-label', `${task.completed ? 'Выполнено: ' : 'Выбрать фокус: '}${task.text}`);

      const number = document.createElement('span');
      number.className = 'task-number';
      number.textContent = String(index + 1).padStart(2, '0');
      const textWrap = document.createElement('span');
      textWrap.className = 'task-text-wrap';
      const title = document.createElement('span');
      title.className = 'task-title';
      title.textContent = task.text;
      const meta = document.createElement('span');
      meta.className = 'task-meta';
      meta.textContent = task.completed ? 'ЗАВЕРШЕНО' : task.id === state.selectedTaskId ? 'СЕЙЧАС В ФОКУСЕ' : 'НАЖМИ, ЧТОБЫ ВЫБРАТЬ';
      textWrap.append(title, meta);
      pick.append(number, textWrap);
      pick.addEventListener('click', () => selectTask(task.id));

      const check = document.createElement('button');
      check.className = 'task-check';
      check.type = 'button';
      check.setAttribute('aria-label', task.completed ? `Вернуть «${task.text}» в план` : `Отметить «${task.text}» как выполненное`);
      check.setAttribute('aria-pressed', String(task.completed));
      check.innerHTML = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3.4 8.1 2.8 2.8 6.4-6.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      check.addEventListener('click', () => toggleTask(task.id));

      const remove = document.createElement('button');
      remove.className = 'delete-task';
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Удалить «${task.text}»`);
      remove.title = 'Удалить точку';
      remove.addEventListener('click', () => deleteTask(task.id));

      row.append(pick, check, remove);
      dom.taskList.append(row);
    });
  }

  function createSvgElement(tag, attrs = {}) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  function renderConstellation() {
    dom.constellationNodes.replaceChildren();
    const path = state.tasks.map((_, index) => POINTS[index]).filter(Boolean);
    if (path.length > 1) {
      const d = path.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
      dom.constellationTrail.setAttribute('d', d);
      dom.constellationTrail.style.opacity = '.7';
    } else {
      dom.constellationTrail.setAttribute('d', '');
      dom.constellationTrail.style.opacity = '.2';
    }

    if (!state.tasks.length) {
      const hint = createSvgElement('text', {
        x: 350, y: 133, 'text-anchor': 'middle', fill: 'rgba(190,190,212,.62)',
        'font-family': 'Manrope, sans-serif', 'font-size': '11', 'letter-spacing': '.04em'
      });
      hint.textContent = 'Оставь здесь то, что действительно важно';
      dom.constellationNodes.append(hint);
      return;
    }

    state.tasks.forEach((task, index) => {
      const point = POINTS[index] || { x: 62 + ((index * 137) % 576), y: 45 + ((index * 83) % 160) };
      const node = createSvgElement('g', {
        class: `map-node${task.id === state.selectedTaskId ? ' is-selected' : ''}${task.completed ? ' is-complete' : ''}`,
        transform: `translate(${point.x} ${point.y})`,
        tabindex: '0',
        role: 'button',
        'aria-label': `${task.completed ? 'Выполнено. ' : ''}Выбрать фокус: ${task.text}`,
        'aria-pressed': String(task.id === state.selectedTaskId),
        'data-task-id': task.id
      });
      node.append(
        createSvgElement('circle', { class: 'node-hit', cx: 0, cy: 0, r: 23 }),
        createSvgElement('circle', { class: 'node-blur', cx: 0, cy: 0, r: 6 }),
        createSvgElement('circle', { class: 'node-halo', cx: 0, cy: 0, r: 12 }),
        createSvgElement('circle', { class: 'node-core', cx: 0, cy: 0, r: 3.5 })
      );
      const label = createSvgElement('text', { class: 'node-index', x: 0, y: 22 });
      label.textContent = String(index + 1).padStart(2, '0');
      node.append(label);
      const title = createSvgElement('title');
      title.textContent = task.text;
      node.append(title);
      node.addEventListener('click', () => selectTask(task.id));
      node.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectTask(task.id);
        }
      });
      dom.constellationNodes.append(node);
    });
  }

  function renderFocusTask() {
    const task = state.tasks.find(item => item.id === state.selectedTaskId && !item.completed);
    if (!task) {
      dom.focusTaskName.textContent = state.tasks.length && state.tasks.every(item => item.completed)
        ? 'Всё важное уже сделано'
        : 'Выбери точку на карте';
      dom.clearFocus.hidden = true;
      return;
    }
    dom.focusTaskName.textContent = task.text;
    dom.clearFocus.hidden = false;
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
  }

  function renderTimer() {
    const time = formatTime(state.remainingSeconds);
    dom.timerTime.textContent = time;
    dom.timerTime.setAttribute('datetime', `PT${Math.floor(state.remainingSeconds / 60)}M${state.remainingSeconds % 60}S`);
    const durationSeconds = state.duration * 60;
    const progress = durationSeconds ? 1 - state.remainingSeconds / durationSeconds : 0;
    dom.timerProgress.style.strokeDasharray = String(CIRCUMFERENCE);
    dom.timerProgress.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress))));
    dom.timerVisual.classList.toggle('is-running', state.isRunning);
    dom.focusPanel.classList.toggle('is-running', state.isRunning);
    dom.timerStatus.textContent = state.isRunning ? 'ИДЁТ СЕАНС' : state.remainingSeconds === 0 ? 'СЕАНС ЗАВЕРШЁН' : 'ГОТОВ К ФОКУСУ';
    dom.timerStartLabel.textContent = state.isRunning ? 'Пауза' : state.remainingSeconds === 0 ? 'Ещё один раунд' : 'Начать фокус';
    dom.timerOverline.textContent = state.isRunning ? 'ТЫ УЖЕ ВНУТРИ МОМЕНТА' : 'ОДИН МАЛЕНЬКИЙ ОТРЕЗОК';
    dom.timerSubline.textContent = state.isRunning ? 'всё остальное подождёт' : 'ни одного «надо»';
    dom.timerStart.setAttribute('aria-label', state.isRunning ? 'Поставить таймер на паузу' : 'Начать фокус-сессию');
    dom.sessionsToday.textContent = String(state.sessions);
    dom.focusMinutesToday.textContent = String(state.focusMinutes);
    $$('.duration-picker button').forEach(button => {
      const selected = Number(button.dataset.minutes) === state.duration;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function renderSky() {
    document.documentElement.dataset.sky = state.sky;
    const sky = SKIES.find(item => item.id === state.sky) || SKIES[0];
    dom.skyLabel.textContent = sky.label;
    dom.skyButton.setAttribute('aria-label', `Цвет неба: ${sky.label}. Нажми, чтобы сменить`);
  }

  function renderAll() {
    renderDate();
    renderProgress();
    renderTasks();
    renderConstellation();
    renderFocusTask();
    renderTimer();
    renderSky();
  }

  function selectTask(taskId) {
    const task = state.tasks.find(item => item.id === taskId && !item.completed);
    if (!task) return;
    state.selectedTaskId = taskId;
    renderTasks();
    renderConstellation();
    renderFocusTask();
    persist();
    showToast(`Фокус установлен: ${task.text}`);
  }

  function toggleTask(taskId) {
    const task = state.tasks.find(item => item.id === taskId);
    if (!task) return;
    task.completed = !task.completed;
    if (task.completed && task.id === state.selectedTaskId) {
      state.selectedTaskId = state.tasks.find(item => !item.completed)?.id || null;
    } else if (!task.completed && !state.selectedTaskId) {
      state.selectedTaskId = task.id;
    }
    renderProgress();
    renderTasks();
    renderConstellation();
    renderFocusTask();
    persist();
    if (task.completed) {
      const done = getDoneCount();
      showToast(done === state.tasks.length ? 'Все точки найдены. Теперь можно просто побыть.' : 'Маленький шаг — уже часть пути.');
    } else {
      showToast('Точка снова на твоей карте.');
    }
  }

  function deleteTask(taskId) {
    const index = state.tasks.findIndex(item => item.id === taskId);
    if (index < 0) return;
    const [removed] = state.tasks.splice(index, 1);
    if (state.selectedTaskId === taskId) state.selectedTaskId = state.tasks.find(item => !item.completed)?.id || null;
    renderProgress();
    renderTasks();
    renderConstellation();
    renderFocusTask();
    persist();
    showToast('Точка убрана с карты.');
  }

  function addTask(text) {
    const cleanText = text.trim().replace(/\s+/g, ' ');
    if (!cleanText) {
      dom.newTaskInput.focus();
      return;
    }
    if (state.tasks.length >= 12) {
      showToast('На этой карте поместится не больше 12 точек.');
      return;
    }
    const task = { id: makeId(), text: cleanText.slice(0, 72), completed: false };
    state.tasks.push(task);
    if (!state.selectedTaskId) state.selectedTaskId = task.id;
    dom.newTaskInput.value = '';
    renderProgress();
    renderTasks();
    renderConstellation();
    renderFocusTask();
    persist();
    showToast('Новая точка появилась на орбите.');
  }

  function pauseTimer() {
    if (!state.isRunning) return;
    state.remainingSeconds = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
    state.isRunning = false;
    state.deadline = null;
    renderTimer();
    persist();
  }

  function startTimer() {
    if (state.isRunning) {
      pauseTimer();
      return;
    }
    if (state.remainingSeconds <= 0) state.remainingSeconds = state.duration * 60;
    state.deadline = Date.now() + state.remainingSeconds * 1000;
    state.isRunning = true;
    renderTimer();
    persist();
  }

  function resetTimer() {
    state.isRunning = false;
    state.deadline = null;
    state.remainingSeconds = state.duration * 60;
    renderTimer();
    persist();
    showToast('Новый отрезок — в твоём темпе.');
  }

  function finishSession() {
    state.remainingSeconds = 0;
    state.isRunning = false;
    state.deadline = null;
    state.sessions += 1;
    state.focusMinutes += state.duration;
    renderTimer();
    persist();
    showToast(`Сессия завершена. ${state.duration} минут внимания — это много.`);
  }

  function tickTimer() {
    if (!state.isRunning || !state.deadline) return;
    const remaining = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
    if (remaining <= 0) {
      finishSession();
      return;
    }
    if (remaining !== state.remainingSeconds) {
      state.remainingSeconds = remaining;
      renderTimer();
      persist();
    }
  }

  function selectDuration(minutes) {
    const duration = Number(minutes);
    if (!PRESETS.includes(duration)) return;
    state.duration = duration;
    state.isRunning = false;
    state.deadline = null;
    state.remainingSeconds = duration * 60;
    renderTimer();
    persist();
  }

  async function toggleAmbient() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      showToast('В этом браузере нет поддержки звуковой атмосферы.');
      return;
    }
    if (ambientOn) {
      ambientOn = false;
      if (ambientGain && audioContext) {
        ambientGain.gain.cancelScheduledValues(audioContext.currentTime);
        ambientGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.18);
      }
      dom.soundButton.setAttribute('aria-pressed', 'false');
      dom.soundButton.title = 'Включить мягкий шум';
      dom.soundLabel.textContent = 'Тихий фон';
      return;
    }

    try {
      if (!audioContext) {
        audioContext = new AudioContextClass();
        const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 3, audioContext.sampleRate);
        const channel = buffer.getChannelData(0);
        // A gently filtered noise bed, generated locally; no audio file or network request.
        let last = 0;
        for (let index = 0; index < channel.length; index += 1) {
          const white = Math.random() * 2 - 1;
          last = (last + (0.018 * white)) / 1.018;
          channel[index] = last * 3.5;
        }
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const filter = audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 760;
        filter.Q.value = 0.45;
        ambientGain = audioContext.createGain();
        ambientGain.gain.value = 0;
        source.connect(filter).connect(ambientGain).connect(audioContext.destination);
        source.start();
      }
      await audioContext.resume();
      ambientGain.gain.cancelScheduledValues(audioContext.currentTime);
      ambientGain.gain.setTargetAtTime(0.075, audioContext.currentTime, 0.6);
      ambientOn = true;
      dom.soundButton.setAttribute('aria-pressed', 'true');
      dom.soundButton.title = 'Выключить мягкий шум';
      dom.soundLabel.textContent = 'Мягкий шум';
    } catch {
      showToast('Не получилось включить звук. Проверь настройки браузера.');
    }
  }

  function cycleSky() {
    const index = SKIES.findIndex(item => item.id === state.sky);
    state.sky = SKIES[(index + 1) % SKIES.length].id;
    renderSky();
    persist();
  }

  function openBreath() {
    lastBreathTrigger = document.activeElement;
    dom.breathOverlay.inert = false;
    dom.breathOverlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => dom.breathOverlay.classList.add('is-open'));
    dom.breathOrbit.dataset.phase = 'rest';
    dom.breathPhase.textContent = 'Когда будешь готов';
    dom.breathCountdown.textContent = '—';
    dom.breathRound.textContent = 'ТРИ СПОКОЙНЫХ ЦИКЛА';
    breathState = 'ready';
    dom.breathStart.disabled = false;
    dom.breathStart.innerHTML = 'Начать <span aria-hidden="true">→</span>';
    setTimeout(() => dom.breathStart.focus(), 100);
  }

  function closeBreath() {
    clearInterval(breathInterval);
    breathInterval = null;
    breathState = 'ready';
    dom.breathOverlay.classList.remove('is-open');
    dom.breathOverlay.setAttribute('aria-hidden', 'true');
    dom.breathOverlay.inert = true;
    if (lastBreathTrigger && typeof lastBreathTrigger.focus === 'function') lastBreathTrigger.focus();
  }

  const BREATH_PHASES = [
    { name: 'inhale', label: 'Вдохни', seconds: 4 },
    { name: 'hold-in', label: 'Мягко задержи', seconds: 2 },
    { name: 'exhale', label: 'Медленно выдохни', seconds: 6 },
    { name: 'rest', label: 'Отпусти', seconds: 2 }
  ];
  const BREATH_CYCLE = BREATH_PHASES.reduce((sum, phase) => sum + phase.seconds, 0);

  function updateBreath() {
    const elapsed = (Date.now() - breathStartedAt) / 1000;
    const total = BREATH_CYCLE * 3;
    if (elapsed >= total) {
      clearInterval(breathInterval);
      breathInterval = null;
      breathState = 'finished';
      dom.breathOrbit.dataset.phase = 'rest';
      dom.breathPhase.textContent = 'Ты здесь.';
      dom.breathCountdown.textContent = 'Можешь возвращаться.';
      dom.breathRound.textContent = 'ПАУЗА ЗАВЕРШЕНА';
      dom.breathStart.disabled = false;
      dom.breathStart.innerHTML = 'Ещё раз <span aria-hidden="true">↻</span>';
      showToast('Пауза — тоже часть пути.');
      return;
    }
    const cycleElapsed = elapsed % BREATH_CYCLE;
    let pointInPhase = cycleElapsed;
    let phase = BREATH_PHASES[0];
    for (const candidate of BREATH_PHASES) {
      if (pointInPhase < candidate.seconds) { phase = candidate; break; }
      pointInPhase -= candidate.seconds;
    }
    dom.breathOrbit.dataset.phase = phase.name;
    dom.breathPhase.textContent = phase.label;
    dom.breathCountdown.textContent = `${Math.max(1, Math.ceil(phase.seconds - pointInPhase))} сек`;
    dom.breathRound.textContent = `ЦИКЛ ${Math.floor(elapsed / BREATH_CYCLE) + 1} ИЗ 3`;
  }

  function startBreath() {
    if (breathState === 'running') return;
    breathState = 'running';
    breathStartedAt = Date.now();
    dom.breathStart.textContent = 'Свет ведёт тебя…';
    updateBreath();
    breathInterval = setInterval(updateBreath, 150);
  }

  function initStarfield() {
    const canvas = $('#starfield');
    const context = canvas.getContext('2d');
    if (!context) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let stars = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.max(55, Math.min(190, Math.round((width * height) / 10000)));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.05 + 0.25,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.0007 + 0.00015,
        glow: Math.random() > 0.87
      }));
      if (reducedMotion) draw(0);
    }

    function draw(now) {
      context.clearRect(0, 0, width, height);
      const dx = pointerX * 5;
      const dy = pointerY * 5;
      const accentRgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim();
      for (const star of stars) {
        const shimmer = reducedMotion ? 0.6 : 0.32 + ((Math.sin(now * star.speed + star.phase) + 1) * 0.3);
        const alpha = shimmer * (star.glow ? 0.9 : 0.48);
        context.beginPath();
        context.arc(star.x + dx * (star.radius * 0.2), star.y + dy * (star.radius * 0.2), star.radius, 0, Math.PI * 2);
        context.fillStyle = star.glow
          ? `rgba(${accentRgb},${alpha})`
          : `rgba(208,211,235,${alpha})`;
        context.fill();
        if (star.glow && star.radius > 0.9) {
          context.fillRect(star.x - 3 + dx * 0.1, star.y + dy * 0.1, 6, 0.55);
          context.fillRect(star.x + dx * 0.1, star.y - 3 + dy * 0.1, 0.55, 6);
        }
      }
      if (!reducedMotion) frame = requestAnimationFrame(draw);
    }

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', event => {
      pointerX = (event.clientX / Math.max(1, width) - 0.5) * 2;
      pointerY = (event.clientY / Math.max(1, height) - 0.5) * 2;
    }, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelAnimationFrame(frame);
      else if (!reducedMotion) frame = requestAnimationFrame(draw);
    });
    resize();
    if (!reducedMotion) frame = requestAnimationFrame(draw);
  }

  dom.addTaskForm.addEventListener('submit', event => {
    event.preventDefault();
    addTask(dom.newTaskInput.value);
  });
  dom.timerStart.addEventListener('click', startTimer);
  dom.timerReset.addEventListener('click', resetTimer);
  dom.clearFocus.addEventListener('click', () => {
    state.selectedTaskId = null;
    renderTasks();
    renderConstellation();
    renderFocusTask();
    persist();
  });
  $$('.duration-picker button').forEach(button => button.addEventListener('click', () => selectDuration(button.dataset.minutes)));
  dom.skyButton.addEventListener('click', cycleSky);
  dom.soundButton.addEventListener('click', toggleAmbient);
  dom.breathButton.addEventListener('click', openBreath);
  dom.breathClose.addEventListener('click', closeBreath);
  dom.breathStart.addEventListener('click', startBreath);
  dom.breathOverlay.addEventListener('click', event => {
    if (event.target === dom.breathOverlay) closeBreath();
  });
  dom.breathDialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusable = $$('button:not([disabled])', dom.breathDialog);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !dom.breathOverlay.inert) {
      closeBreath();
      return;
    }
    if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey || !dom.breathOverlay.inert) return;
    const target = event.target;
    if (target instanceof Element && target.closest('input, textarea, select, button, a, [role="button"], [tabindex="0"]')) return;
    if (event.code === 'Space') {
      event.preventDefault();
      startTimer();
    } else if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      dom.newTaskInput.focus();
    } else if (event.key.toLowerCase() === 'r') {
      resetTimer();
    }
  });

  renderAll();
  persist();
  timerInterval = setInterval(tickTimer, 200);
  initStarfield();

  window.addEventListener('pagehide', () => {
    if (state.isRunning) state.remainingSeconds = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
    persist();
    if (audioContext && audioContext.state !== 'closed') audioContext.close();
  }, { once: true });
})();
