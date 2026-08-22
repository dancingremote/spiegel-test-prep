(function () {
  const STORAGE_KEY = 'spiegelTestPrepState';
  const SECTION_ORDER = [1, 2, 3, 4, 5, 6].map(n => `Test ${n}`)
    .concat(Array.from({ length: 20 }, (_, i) => `Vignette ${i + 1}`));

  const sectionSelect = document.getElementById('sectionSelect');
  const scoreBadge = document.getElementById('scoreBadge');
  const progressText = document.getElementById('progressText');
  const content = document.getElementById('content');
  const qnav = document.getElementById('qnav');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const finishTestBtn = document.getElementById('finishTestBtn');
  const resetSectionBtn = document.getElementById('resetSectionBtn');
  const resetAllBtn = document.getElementById('resetAllBtn');
  const flaggedCountEl = document.getElementById('flaggedCount');
  const incorrectCountEl = document.getElementById('incorrectCount');
  const landingScreen = document.getElementById('landingScreen');
  const studyScreen = document.getElementById('studyScreen');
  const homeBtn = document.getElementById('homeBtn');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');

  const sectionMap = new Map();
  QUESTIONS.forEach(q => {
    if (!sectionMap.has(q.section)) sectionMap.set(q.section, { name: q.section, count: 0 });
    sectionMap.get(q.section).count += 1;
  });
  const sections = SECTION_ORDER.filter(s => sectionMap.has(s)).map(s => sectionMap.get(s));
  const questionById = new Map(QUESTIONS.map(q => [q.id, q]));

  const defaults = {
    section: 'all',
    view: 'study',
    mode: 'quiz',
    index: 0,
    answered: {},
    testAnswers: {},
    testSubmitted: {},
    flagged: {},
    missed: {},
    eliminated: {},
    atSummary: false
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) throw new Error('none');
      return Object.assign({}, defaults, JSON.parse(raw));
    } catch (e) {
      return Object.assign({}, defaults);
    }
  }

  let state = loadState();
  let currentScreen = 'landing';
  let searchTerm = '';
  let browseRevealed = false;
  let pendingSelection = [];

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function setKey() {
    return `${state.section}|${state.view}`;
  }

  function lettersEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    const bSet = new Set(b);
    return a.every(x => bSet.has(x));
  }

  function toggleSelection(current, letter, isMulti) {
    if (!isMulti) return [letter];
    const idx = current.indexOf(letter);
    if (idx >= 0) { const copy = current.slice(); copy.splice(idx, 1); return copy; }
    return current.concat([letter]);
  }

  function requiresSubmit(q) {
    return q.sectionType === 'vignette';
  }

  function matchesSearch(q, term) {
    if (q.question.toLowerCase().includes(term)) return true;
    if (q.choices.some(c => c.toLowerCase().includes(term))) return true;
    if (q.explanation && q.explanation.toLowerCase().includes(term)) return true;
    if (q.vignetteStem && q.vignetteStem.toLowerCase().includes(term)) return true;
    return false;
  }

  function currentList() {
    if (searchTerm) return QUESTIONS.filter(q => matchesSearch(q, searchTerm));
    let list = state.section === 'all' ? QUESTIONS : QUESTIONS.filter(q => q.section === state.section);
    if (state.view === 'flagged') list = list.filter(q => state.flagged[q.id]);
    if (state.view === 'incorrect') list = list.filter(q => state.missed[q.id]);
    return list;
  }

  function clearSearch() {
    searchTerm = '';
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
  }

  function sectionFlagCounts() {
    const list = state.section === 'all' ? QUESTIONS : QUESTIONS.filter(q => q.section === state.section);
    let flagged = 0, missed = 0;
    list.forEach(q => {
      if (state.flagged[q.id]) flagged += 1;
      if (state.missed[q.id]) missed += 1;
    });
    return { flagged, missed };
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatExplanation(q) {
    const explanation = q.explanation || '';
    if (q.answerText && explanation.startsWith(q.answerText)) {
      const rest = explanation.slice(q.answerText.length).trim();
      return `<strong>${escapeHtml(q.answerText)}</strong>${escapeHtml(rest)}`;
    }
    return escapeHtml(explanation);
  }

  function questionTag(q) {
    return q.sectionType === 'test' ? `Test ${q.testNum} &middot; Q${q.qnum}` : `${q.vignetteName} &middot; Q${q.qnum}`;
  }

  function populateSectionSelect() {
    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = `All Sections (${QUESTIONS.length} questions)`;
    sectionSelect.appendChild(allOpt);
    sections.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = `${s.name} (${s.count})`;
      sectionSelect.appendChild(opt);
    });
    sectionSelect.value = state.section;
  }

  function questionStatus(q) {
    const submitted = !!state.testSubmitted[setKey()];
    if (state.mode === 'test') {
      if (submitted) {
        const sel = state.testAnswers[q.id];
        if (!sel || !sel.length) return 'omitted';
        return lettersEqual(sel, q.correctLetters) ? 'correct' : 'incorrect';
      }
      return (state.testAnswers[q.id] && state.testAnswers[q.id].length) ? 'answered' : 'unanswered';
    }
    const a = state.answered[q.id];
    if (!a) return 'unanswered';
    return a.correct ? 'correct' : 'incorrect';
  }

  function finishTest() {
    const list = currentList();
    list.forEach(q => {
      const sel = state.testAnswers[q.id];
      if (sel && sel.length && !lettersEqual(sel, q.correctLetters)) state.missed[q.id] = true;
    });
    state.testSubmitted[setKey()] = true;
  }

  function goNext() {
    const list = currentList();
    if (!list.length) return;
    if (state.atSummary) return;
    browseRevealed = false;
    pendingSelection = [];
    if (state.index < list.length - 1) {
      state.index += 1;
    } else {
      if (state.mode === 'test' && !state.testSubmitted[setKey()]) finishTest();
      state.atSummary = true;
    }
    saveState();
    render();
  }

  function goPrev() {
    const list = currentList();
    if (!list.length) return;
    browseRevealed = false;
    pendingSelection = [];
    if (state.atSummary) {
      state.atSummary = false;
      state.index = list.length - 1;
    } else {
      state.index = Math.max(0, state.index - 1);
    }
    saveState();
    render();
  }

  function jumpTo(i) {
    browseRevealed = false;
    pendingSelection = [];
    state.atSummary = false;
    state.index = i;
    saveState();
    render();
  }

  function switchView(view) {
    clearSearch();
    browseRevealed = false;
    pendingSelection = [];
    state.view = view;
    state.index = 0;
    state.atSummary = false;
    saveState();
    render();
  }

  function switchMode(mode) {
    browseRevealed = false;
    pendingSelection = [];
    state.mode = mode;
    state.atSummary = false;
    saveState();
    render();
  }

  function renderQnav(list, currentId) {
    if (!list.length) { qnav.innerHTML = ''; return; }
    qnav.innerHTML = list.map((q, i) => {
      const status = questionStatus(q);
      let cls = 'qnav-pill';
      if (q.id === currentId && !state.atSummary) cls += ' current';
      if (status === 'correct') cls += ' q-correct';
      else if (status === 'incorrect') cls += ' q-incorrect';
      else if (status === 'answered') cls += ' q-answered';
      const flagDot = state.flagged[q.id] ? '<span class="flag-dot"></span>' : '';
      return `<button type="button" class="${cls}" data-index="${i}">${i + 1}${flagDot}</button>`;
    }).join('');
  }

  function scopedScore(list) {
    let correct = 0, attempted = 0;
    list.forEach(q => {
      const a = state.answered[q.id];
      if (!a) return;
      attempted += 1;
      if (a.correct) correct += 1;
    });
    return { correct, attempted };
  }

  function renderSummary(list) {
    let correct = 0, incorrect = 0, omitted = 0;
    const missedRefs = [];
    list.forEach(q => {
      const status = questionStatus(q);
      if (status === 'correct') correct += 1;
      else if (status === 'incorrect') { incorrect += 1; missedRefs.push(q); }
      else omitted += 1;
    });
    const attempted = correct + incorrect;
    const pct = attempted ? Math.round((correct / attempted) * 100) : 0;

    const chipsHtml = missedRefs.map(q =>
      `<button type="button" class="missed-chip" data-jump="${q.id}">${q.sectionType === 'test' ? 'T' + q.testNum : q.vignetteName.replace('Vignette ', 'V')}.${q.qnum}</button>`
    ).join('');

    content.innerHTML = `
      <div class="summary-panel">
        <h2>Set Complete</h2>
        <p>${list.length} question${list.length === 1 ? '' : 's'} in this set.</p>
        <div class="summary-stats">
          <div class="summary-stat correct"><div class="num">${correct}</div><div class="label">Correct</div></div>
          <div class="summary-stat incorrect"><div class="num">${incorrect}</div><div class="label">Incorrect</div></div>
          <div class="summary-stat omitted"><div class="num">${omitted}</div><div class="label">Omitted</div></div>
          <div class="summary-stat"><div class="num">${pct}%</div><div class="label">Score</div></div>
        </div>
        ${missedRefs.length ? `<p>Missed questions:</p><div class="missed-chips">${chipsHtml}</div>` : ''}
        <div class="summary-actions">
          <button class="btn-secondary" id="backToFirstBtn">Back to Question 1</button>
          <button class="btn-secondary" id="restartSetBtn">Restart This Set</button>
          <button class="btn-primary" id="goIncorrectBtn">Go to Incorrect List</button>
        </div>
      </div>
    `;

    document.getElementById('backToFirstBtn').addEventListener('click', () => {
      state.atSummary = false;
      state.index = 0;
      saveState();
      render();
    });
    document.getElementById('restartSetBtn').addEventListener('click', () => {
      list.forEach(q => {
        delete state.answered[q.id];
        delete state.testAnswers[q.id];
        delete state.eliminated[q.id];
      });
      delete state.testSubmitted[setKey()];
      state.atSummary = false;
      state.index = 0;
      saveState();
      render();
    });
    document.getElementById('goIncorrectBtn').addEventListener('click', () => {
      switchView('incorrect');
    });
    content.querySelectorAll('.missed-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const qid = chip.getAttribute('data-jump');
        const idx = list.findIndex(q => q.id === qid);
        if (idx >= 0) jumpTo(idx);
      });
    });
  }

  function sectionStats(sectionName) {
    const list = sectionName === 'all' ? QUESTIONS : QUESTIONS.filter(q => q.section === sectionName);
    let correct = 0, incorrect = 0;
    list.forEach(q => {
      const a = state.answered[q.id];
      if (a) { if (a.correct) correct += 1; else incorrect += 1; }
    });
    return { total: list.length, correct, incorrect, attempted: correct + incorrect };
  }

  function enterStudy(sectionName, view) {
    clearSearch();
    browseRevealed = false;
    pendingSelection = [];
    const resuming = state.section === sectionName && state.view === view;
    state.section = sectionName;
    state.view = view;
    if (!resuming) {
      state.index = 0;
      state.atSummary = false;
    }
    sectionSelect.value = sectionName;
    saveState();
    showScreen('study');
  }

  function renderLanding() {
    const allStats = sectionStats('all');
    const flaggedN = Object.keys(state.flagged).length;
    const missedN = Object.keys(state.missed).length;
    const attemptedN = Object.keys(state.answered).length;
    const pctComplete = QUESTIONS.length ? Math.round((attemptedN / QUESTIONS.length) * 100) : 0;

    function renderRow(s) {
      const stats = sectionStats(s.name);
      const metaParts = [`${stats.total} Qs`];
      if (stats.attempted) {
        metaParts.push(`<span class="stat-correct">${stats.correct}&check;</span>`);
        if (stats.incorrect) metaParts.push(`<span class="stat-incorrect">${stats.incorrect}&cross;</span>`);
      }
      const subtitle = s.name.startsWith('Vignette ') ? 'Clinical vignette, may include multi-select questions' : 'Full-length test';
      return `<button type="button" class="landing-row" data-section="${escapeHtml(s.name)}" title="${escapeHtml(subtitle)}">
        <span class="ch-title">${escapeHtml(s.name)}</span>
        <span class="ch-meta">${metaParts.join(' &middot; ')}</span>
      </button>`;
    }

    const testSections = sections.filter(s => !s.name.startsWith('Vignette '));
    const vignetteSections = sections.filter(s => s.name.startsWith('Vignette '));
    const testRowsHtml = testSections.map(renderRow).join('');
    const vignetteRowsHtml = vignetteSections.map(renderRow).join('');

    landingScreen.innerHTML = `
      <div class="landing-hero">
        <h1>Spiegel Test Prep</h1>
        <p>Psychiatry Test Preparation &amp; Review Manual — select a test or a vignette to begin.</p>
      </div>
      <div class="landing-quick-links">
        <button type="button" class="landing-quick-card" id="landingAllBtn">All Sections (${allStats.total})</button>
        <button type="button" class="landing-quick-card flag-card" id="landingFlaggedBtn">&#9873; Flagged (${flaggedN})</button>
        <button type="button" class="landing-quick-card incorrect-card" id="landingIncorrectBtn">&#10007; Incorrect (${missedN})</button>
      </div>
      <p class="landing-section-label">Tests</p>
      <div class="landing-list-wrap landing-list-wrap-tests"><div class="landing-list" style="columns:1">${testRowsHtml}</div></div>
      <p class="landing-section-label">Vignettes</p>
      <div class="landing-list-wrap"><div class="landing-list" style="columns:2">${vignetteRowsHtml}</div></div>
      <div class="landing-footer">
        <div class="landing-progress">
          <div class="landing-progress-bar"><div class="landing-progress-fill" style="width:${pctComplete}%"></div></div>
          <span class="landing-progress-text">${attemptedN} of ${QUESTIONS.length} questions attempted (${pctComplete}%)</span>
        </div>
        <button type="button" class="reset-link reset-link-danger" id="landingResetAllBtn">Reset entire bank</button>
      </div>
    `;

    document.getElementById('landingAllBtn').addEventListener('click', () => enterStudy('all', 'study'));
    document.getElementById('landingFlaggedBtn').addEventListener('click', () => enterStudy('all', 'flagged'));
    document.getElementById('landingIncorrectBtn').addEventListener('click', () => enterStudy('all', 'incorrect'));
    landingScreen.querySelectorAll('.landing-row').forEach(row => {
      row.addEventListener('click', () => enterStudy(row.getAttribute('data-section'), 'study'));
    });
    document.getElementById('landingResetAllBtn').addEventListener('click', resetEntireBank);
  }

  function showScreen(screen) {
    currentScreen = screen;
    if (screen === 'landing') {
      landingScreen.style.display = '';
      studyScreen.style.display = 'none';
      renderLanding();
    } else {
      landingScreen.style.display = 'none';
      studyScreen.style.display = 'block';
      render();
    }
  }

  function render() {
    const list = currentList();

    document.querySelectorAll('.tab-group button').forEach(b => b.classList.toggle('active', b.getAttribute('data-view') === state.view));
    document.querySelectorAll('.mode-toggle button').forEach(b => b.classList.toggle('active', b.getAttribute('data-mode') === state.mode));
    const counts = sectionFlagCounts();
    flaggedCountEl.textContent = counts.flagged;
    incorrectCountEl.textContent = counts.missed;
    clearSearchBtn.style.display = searchTerm ? '' : 'none';

    if (!list.length) {
      qnav.innerHTML = '';
      progressText.textContent = 'No questions';
      const msg = searchTerm
        ? `No questions match "${searchTerm}".`
        : state.view === 'flagged'
          ? "You haven't flagged any questions yet. Flag a question from Study mode to save it here."
          : state.view === 'incorrect'
            ? "No incorrect questions recorded yet — nice work, or you haven't taken a quiz/test yet."
            : 'No questions in this section.';
      content.innerHTML = `<div class="empty-state">${msg}</div>`;
      scoreBadge.textContent = '';
      finishTestBtn.style.display = 'none';
      return;
    }

    if (state.index >= list.length) state.index = list.length - 1;
    if (state.index < 0) state.index = 0;
    const q = list[state.index];

    const score = scopedScore(list);
    scoreBadge.textContent = score.attempted
      ? `Score (this set): ${score.correct} / ${score.attempted} (${Math.round((score.correct / score.attempted) * 100)}%)`
      : '';

    finishTestBtn.style.display = (state.mode === 'test' && !state.testSubmitted[setKey()] && !state.atSummary) ? '' : 'none';

    renderQnav(list, state.atSummary ? null : q.id);

    if (state.atSummary) {
      progressText.textContent = `Set complete — ${list.length} question${list.length === 1 ? '' : 's'}`;
      renderSummary(list);
      return;
    }

    progressText.textContent = searchTerm
      ? `Search "${searchTerm}": question ${state.index + 1} of ${list.length}`
      : `Question ${state.index + 1} of ${list.length}`;

    renderQuestion(q, list);
  }

  function renderQuestion(q, list) {
    const submitted = !!state.testSubmitted[setKey()];
    const answer = state.answered[q.id];
    const isRevealedBrowse = browseRevealed;
    const testSelected = state.testAnswers[q.id] || [];
    const needsSubmit = requiresSubmit(q);

    let showAnswer = false;
    if (state.mode === 'browse') showAnswer = isRevealedBrowse;
    else if (state.mode === 'quiz') showAnswer = !!answer;
    else if (state.mode === 'test') showAnswer = submitted;

    const quizPending = state.mode === 'quiz' && needsSubmit && !answer;

    const choicesHtml = q.choices.map((choiceText, i) => {
      const letter = q.choiceLetters[i];
      let cls = 'choice';
      const badge = needsSubmit || q.isMultiSelect ? `<span class="checkbox">${letter}</span>` : `<span class="letter">${letter}</span>`;

      if (state.mode === 'quiz' && !needsSubmit && !answer) cls += ' clickable';
      if (state.mode === 'quiz' && quizPending) cls += ' clickable';
      if (state.mode === 'test' && !submitted) cls += ' clickable';

      if (quizPending) {
        if (pendingSelection.includes(letter)) cls += ' selected-multi';
      } else if (state.mode === 'test' && !submitted) {
        if (testSelected.includes(letter)) cls += ' selected-multi';
      } else if (showAnswer) {
        const selectedLetters = state.mode === 'test' ? testSelected : (answer ? answer.selectedLetters : []);
        const isCorrectChoice = q.correctLetters.includes(letter);
        const wasSelected = selectedLetters.includes(letter);
        if (isCorrectChoice && wasSelected) cls += ' correct';
        else if (isCorrectChoice && !wasSelected) cls += ' missed-correct';
        else if (!isCorrectChoice && wasSelected) cls += ' incorrect';
      }
      if ((state.mode === 'quiz' && answer) || (state.mode === 'test' && submitted)) cls += ' locked';
      const eliminatedLetters = state.eliminated[q.id] || [];
      if (eliminatedLetters.includes(letter)) cls += ' eliminated';

      return `<button type="button" class="${cls}" data-letter="${letter}">
        ${badge}<span>${escapeHtml(choiceText)}</span>
      </button>`;
    }).join('');

    let answerPanelHtml = '';
    if (showAnswer) {
      let resultLine = '';
      if (state.mode === 'quiz' && answer) {
        resultLine = answer.correct
          ? '<div class="result correct-result">Correct</div>'
          : `<div class="result incorrect-result">Incorrect — correct answer is ${q.correctLetters.join(', ')}</div>`;
      } else if (state.mode === 'test' && submitted) {
        if (!testSelected.length) {
          resultLine = `<div class="result incorrect-result">Omitted — correct answer is ${q.correctLetters.join(', ')}</div>`;
        } else {
          resultLine = lettersEqual(testSelected, q.correctLetters)
            ? '<div class="result correct-result">Correct</div>'
            : `<div class="result incorrect-result">Incorrect — correct answer is ${q.correctLetters.join(', ')}</div>`;
        }
      }
      answerPanelHtml = `
        <div class="answer-panel">
          ${resultLine}
          <div class="explanation">${formatExplanation(q)}</div>
        </div>`;
    }

    let actionsHtml = '';
    if (state.mode === 'browse' && !isRevealedBrowse) {
      actionsHtml = `<div class="actions"><button class="btn-primary" id="revealBtn">Show Answer</button></div>`;
    } else if (quizPending) {
      actionsHtml = `<div class="actions"><button class="btn-primary" id="submitBtn" ${pendingSelection.length ? '' : 'disabled'}>Submit</button></div>`;
    } else if (state.mode === 'test' && !submitted) {
      actionsHtml = `<p class="test-hint">Select ${q.isMultiSelect ? 'your answers' : 'an answer'}, then use Next to continue. Your answer won't be scored until you click Finish Test.</p>`;
    }

    const isFlagged = !!state.flagged[q.id];
    const canRetry = state.mode === 'quiz' && !!answer && state.view === 'study';

    const vignetteHtml = q.vignetteStem
      ? `<div class="vignette-stem"><div class="vignette-stem-label">Case</div><div class="vignette-stem-text">${escapeHtml(q.vignetteStem)}</div></div>`
      : '';
    const multiHint = q.isMultiSelect && !showAnswer ? `<p class="multi-select-hint">Select ${q.correctLetters.length} answer${q.correctLetters.length === 1 ? '' : 's'}.</p>` : '';
    const imageHtml = q.image ? `<div class="question-image"><img src="${q.image}" alt="Question image" loading="lazy"></div>` : '';

    content.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="tag">${questionTag(q)}</span>
          <div class="card-header-actions">
            ${canRetry ? '<button type="button" class="icon-btn retry-btn" id="retryBtn">&#8635; Retry</button>' : ''}
            <button type="button" class="icon-btn ${isFlagged ? 'flagged' : ''}" id="flagBtn">${isFlagged ? '&#9873; Flagged' : '&#9872; Flag'}</button>
          </div>
        </div>
        ${vignetteHtml}
        <p class="question-text">${escapeHtml(q.question)}</p>
        ${imageHtml}
        ${multiHint}
        <div class="choices">${choicesHtml}</div>
        ${actionsHtml}
        ${answerPanelHtml}
      </div>
    `;

    document.getElementById('flagBtn').addEventListener('click', () => {
      if (state.flagged[q.id]) delete state.flagged[q.id];
      else state.flagged[q.id] = true;
      saveState();
      render();
    });

    const retryBtn = document.getElementById('retryBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        delete state.answered[q.id];
        pendingSelection = [];
        saveState();
        render();
      });
    }

    if (state.mode === 'browse') {
      const revealBtn = document.getElementById('revealBtn');
      if (revealBtn) {
        revealBtn.addEventListener('click', () => {
          browseRevealed = true;
          render();
        });
      }
    }

    if (state.mode === 'quiz' && !needsSubmit && !answer) {
      content.querySelectorAll('.choice').forEach(btn => {
        btn.addEventListener('click', () => {
          if (state.answered[q.id]) return;
          const letter = btn.getAttribute('data-letter');
          const correct = letter === q.correctLetters[0];
          state.answered[q.id] = { selectedLetters: [letter], correct };
          if (!correct) state.missed[q.id] = true;
          else delete state.missed[q.id];
          saveState();
          render();
        });
      });
    }

    if (quizPending) {
      content.querySelectorAll('.choice').forEach(btn => {
        btn.addEventListener('click', () => {
          const letter = btn.getAttribute('data-letter');
          pendingSelection = toggleSelection(pendingSelection, letter, q.isMultiSelect);
          render();
        });
      });
      const submitBtn = document.getElementById('submitBtn');
      if (submitBtn) {
        submitBtn.addEventListener('click', () => {
          if (!pendingSelection.length) return;
          const correct = lettersEqual(pendingSelection, q.correctLetters);
          state.answered[q.id] = { selectedLetters: pendingSelection.slice(), correct };
          if (!correct) state.missed[q.id] = true;
          else delete state.missed[q.id];
          pendingSelection = [];
          saveState();
          render();
        });
      }
    }

    if (state.mode === 'test' && !submitted) {
      content.querySelectorAll('.choice').forEach(btn => {
        btn.addEventListener('click', () => {
          const letter = btn.getAttribute('data-letter');
          state.testAnswers[q.id] = toggleSelection(state.testAnswers[q.id] || [], letter, q.isMultiSelect);
          saveState();
          render();
        });
      });
    }
  }

  sectionSelect.addEventListener('change', () => {
    clearSearch();
    browseRevealed = false;
    pendingSelection = [];
    state.section = sectionSelect.value;
    state.index = 0;
    state.atSummary = false;
    saveState();
    render();
  });

  searchInput.addEventListener('input', () => {
    searchTerm = searchInput.value.trim().toLowerCase();
    clearSearchBtn.style.display = searchTerm ? '' : 'none';
    browseRevealed = false;
    pendingSelection = [];
    state.index = 0;
    state.atSummary = false;
    render();
  });

  clearSearchBtn.addEventListener('click', () => {
    clearSearch();
    browseRevealed = false;
    pendingSelection = [];
    state.index = 0;
    render();
  });

  document.querySelectorAll('.tab-group button').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.getAttribute('data-view')));
  });

  document.querySelectorAll('.mode-toggle button').forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.getAttribute('data-mode')));
  });

  prevBtn.addEventListener('click', goPrev);
  nextBtn.addEventListener('click', goNext);

  document.addEventListener('keydown', (e) => {
    if (currentScreen !== 'study') return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); return; }
    if (/^[A-Za-z]$/.test(e.key)) {
      const btn = content.querySelector(`.choice[data-letter="${e.key.toUpperCase()}"]`);
      if (btn) { e.preventDefault(); btn.click(); }
    }
  });

  content.addEventListener('contextmenu', (e) => {
    const btn = e.target.closest('.choice');
    if (!btn) return;
    e.preventDefault();
    const list = currentList();
    if (state.atSummary || !list.length) return;
    const q = list[state.index];
    const letter = btn.getAttribute('data-letter');
    const current = state.eliminated[q.id] || [];
    const idx = current.indexOf(letter);
    if (idx >= 0) {
      const copy = current.slice();
      copy.splice(idx, 1);
      if (copy.length) state.eliminated[q.id] = copy; else delete state.eliminated[q.id];
    } else {
      state.eliminated[q.id] = current.concat([letter]);
    }
    saveState();
    render();
  });

  finishTestBtn.addEventListener('click', () => {
    finishTest();
    state.atSummary = true;
    saveState();
    render();
  });

  qnav.addEventListener('click', (e) => {
    const pill = e.target.closest('.qnav-pill');
    if (!pill) return;
    jumpTo(Number(pill.getAttribute('data-index')));
  });

  resetSectionBtn.addEventListener('click', () => {
    const list = currentList();
    if (!list.length) return;
    if (!confirm(`Clear quiz/test answers, flags, and incorrect records for the ${list.length} question${list.length === 1 ? '' : 's'} currently shown? This cannot be undone.`)) return;
    list.forEach(q => {
      delete state.answered[q.id];
      delete state.testAnswers[q.id];
      delete state.flagged[q.id];
      delete state.missed[q.id];
      delete state.eliminated[q.id];
    });
    delete state.testSubmitted[setKey()];
    browseRevealed = false;
    pendingSelection = [];
    state.atSummary = false;
    state.index = 0;
    saveState();
    render();
  });

  function resetEntireBank() {
    if (!confirm(`Clear ALL quiz/test answers, flags, and the incorrect-question record for the entire ${QUESTIONS.length}-question bank? This cannot be undone.`)) return;
    if (!confirm('Are you sure?')) return;
    state.answered = {};
    state.testAnswers = {};
    state.testSubmitted = {};
    state.flagged = {};
    state.missed = {};
    state.eliminated = {};
    browseRevealed = false;
    pendingSelection = [];
    state.atSummary = false;
    state.view = 'study';
    state.index = 0;
    saveState();
    if (currentScreen === 'landing') renderLanding(); else render();
  }

  resetAllBtn.addEventListener('click', resetEntireBank);

  homeBtn.addEventListener('click', () => showScreen('landing'));

  populateSectionSelect();
  showScreen('landing');
})();
