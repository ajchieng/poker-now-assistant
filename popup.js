document.addEventListener('DOMContentLoaded', () => {
  const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
  const enabledElement = document.getElementById('enabled');
  const soundEnabledElement = document.getElementById('soundEnabled');
  const rangeModeElement = document.getElementById('rangeMode');
  const positionControlsElement = document.getElementById('positionControls');
  const playerCountElement = document.getElementById('playerCount');
  const positionElement = document.getElementById('position');
  const copySingleElement = document.getElementById('copySingle');
  const presetLabelElement = document.getElementById('presetLabel');
  const editingLabelElement = document.getElementById('editingLabel');
  const contextHelpElement = document.getElementById('contextHelp');
  const rangeElement = document.getElementById('range');
  const selectedCountElement = document.getElementById('selectedCount');
  const runtimeStatusElement = document.getElementById('runtimeStatus');
  const bypassHandElement = document.getElementById('bypassHand');
  const saveStatusElement = document.getElementById('saveStatus');
  let dragging = false;
  let dragMode = 'select';
  let changedDuringDrag = new Set();
  let statusTimer = null;
  let rangeMode = PokerNowAssistantCore.DEFAULT_RANGE_MODE;
  let singleRangeSet = {};
  let savedPositionRanges = {};
  let positionRanges = {};
  let latestRuntimeStatus = null;

  for (let playerCount = 2; playerCount <= 8; playerCount += 1) {
    const option = document.createElement('option');
    option.value = String(playerCount);
    option.textContent = String(playerCount);
    if (playerCount === 6) option.selected = true;
    playerCountElement.appendChild(option);
  }
  function handKey(row, column) {
    if (row === column) return `${RANKS[row]}${RANKS[column]}`;
    if (row < column) return `${RANKS[row]}${RANKS[column]}s`;
    return `${RANKS[column]}${RANKS[row]}o`;
  }

  function showSaved(message = 'Saved') {
    window.clearTimeout(statusTimer);
    saveStatusElement.textContent = message;
    statusTimer = window.setTimeout(() => {
      saveStatusElement.textContent = '';
    }, 1400);
  }

  function selectedRange() {
    const rangeSet = {};
    rangeElement.querySelectorAll('.cell.selected').forEach((cell) => {
      rangeSet[cell.dataset.key] = true;
    });
    return rangeSet;
  }

  function rangeSetToText(rangeSet) {
    return PokerNowAssistantCore.HAND_KEYS
      .filter((key) => rangeSet?.[key])
      .join(', ');
  }

  function rangeSetsEqual(firstRangeSet, secondRangeSet) {
    return PokerNowAssistantCore.HAND_KEYS.every((key) => (
      Boolean(firstRangeSet?.[key]) === Boolean(secondRangeSet?.[key])
    ));
  }

  function defaultRangeSetForCurrentPage() {
    if (rangeMode !== 'position') return {};
    return PokerNowAssistantCore.decodeRangeSet(
      PokerNowAssistantCore.DEFAULT_POSITION_RANGES[currentPositionRangeKey()]
    );
  }

  function defaultEncodedRange(rangeKey) {
    return PokerNowAssistantCore.DEFAULT_POSITION_RANGES[rangeKey] || null;
  }

  function normalizePositionRangeOverrides(ranges) {
    return Object.fromEntries(
      Object.entries(ranges || {}).filter(([rangeKey, encodedRange]) => (
        encodedRange !== defaultEncodedRange(rangeKey)
      ))
    );
  }

  function rangeStateLabel(rangeSet) {
    if (!PokerNowAssistantCore.hasSelectedHands(rangeSet)) return 'Empty';
    if (rangeMode !== 'position') return 'Custom';
    return rangeSetsEqual(rangeSet, defaultRangeSetForCurrentPage()) ? 'Default' : 'Custom';
  }

  function updatePresetLabel(rangeSet = selectedRange()) {
    const stateLabel = rangeStateLabel(rangeSet);
    presetLabelElement.textContent = stateLabel;
    presetLabelElement.className = `preset-label ${stateLabel.toLowerCase()}`;
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  async function readTextFromClipboard() {
    if (navigator.clipboard?.readText) return navigator.clipboard.readText();

    return window.prompt('Paste range text') || '';
  }

  function currentPositionRangeKey() {
    return PokerNowAssistantCore.positionRangeKey(
      Number(playerCountElement.value),
      positionElement.value
    );
  }

  function renderPositionOptions() {
    const validPositions = PokerNowAssistantCore.positionsForPlayerCount(Number(playerCountElement.value));
    const previousPosition = positionElement.value;
    positionElement.innerHTML = '';
    validPositions.forEach((position) => {
      const option = document.createElement('option');
      option.value = position;
      option.textContent = position;
      positionElement.appendChild(option);
    });

    positionElement.value = validPositions.includes(previousPosition)
      ? previousPosition
      : validPositions[0] || '';
  }

  function currentRangeSet() {
    if (rangeMode === 'single') return singleRangeSet;
    return PokerNowAssistantCore.decodeRangeSet(positionRanges[currentPositionRangeKey()]);
  }

  function renderRangeEditor() {
    const positionMode = rangeMode === 'position';
    renderPositionOptions();
    rangeModeElement.value = rangeMode;
    positionControlsElement.classList.toggle('hidden', !positionMode);
    if (positionMode) {
      editingLabelElement.textContent = `Editing ${positionElement.value}, ${playerCountElement.value} players`;
      contextHelpElement.textContent = 'PokerNow seat position chooses the position; folded players keep the same player-count profile.';
    } else {
      editingLabelElement.textContent = 'Editing single range';
      contextHelpElement.textContent = 'One range is used at every table.';
    }
    buildGrid(currentRangeSet());
  }

  function syncEditorToRuntimeContext(runtimeStatus) {
    if (rangeMode !== 'position') return;

    const activePlayerCount = Number(runtimeStatus?.activePlayerCount);
    const position = runtimeStatus?.position;
    if (!Number.isInteger(activePlayerCount) || activePlayerCount < 2 || activePlayerCount > 8) return;

    const validPositions = PokerNowAssistantCore.positionsForPlayerCount(activePlayerCount);
    if (!validPositions.includes(position)) return;
    if (playerCountElement.value === String(activePlayerCount) && positionElement.value === position) return;

    playerCountElement.value = String(activePlayerCount);
    renderPositionOptions();
    positionElement.value = position;
    renderRangeEditor();
    return true;
  }

  function setSelected(cell, selected) {
    cell.classList.toggle('selected', selected);
    cell.setAttribute('aria-checked', selected ? 'true' : 'false');
  }

  function updateCount() {
    const count = rangeElement.querySelectorAll('.cell.selected').length;
    selectedCountElement.textContent = `${count} / 169 kept`;
    selectedCountElement.classList.toggle('warning', count === 0);
    updatePresetLabel();
  }

  function saveRange(message = 'Saved') {
    const updatedRange = selectedRange();
    if (rangeMode === 'single') {
      singleRangeSet = updatedRange;
      chrome.storage.sync.set({ rangeSet: singleRangeSet }, () => showSaved(message));
    } else {
      const rangeKey = currentPositionRangeKey();
      const encodedRange = PokerNowAssistantCore.encodeRangeSet(updatedRange);
      savedPositionRanges = { ...savedPositionRanges };
      if (encodedRange === defaultEncodedRange(rangeKey)) {
        delete savedPositionRanges[rangeKey];
      } else {
        savedPositionRanges[rangeKey] = encodedRange;
      }
      positionRanges = PokerNowAssistantCore.mergePositionRanges(savedPositionRanges);
      chrome.storage.sync.set({ positionRanges: savedPositionRanges }, () => showSaved(message));
    }
    updateCount();
  }

  function resetCurrentRangeToDefault() {
    if (rangeMode === 'single') {
      buildGrid({});
      saveRange('Default restored');
      return;
    }

    const rangeKey = currentPositionRangeKey();
    savedPositionRanges = { ...savedPositionRanges };
    delete savedPositionRanges[rangeKey];
    positionRanges = PokerNowAssistantCore.mergePositionRanges(savedPositionRanges);
    buildGrid(currentRangeSet());
    chrome.storage.sync.set({ positionRanges: savedPositionRanges }, () => showSaved('Default restored'));
  }

  function applyDrag(cell) {
    const key = cell?.dataset?.key;
    if (!key || changedDuringDrag.has(key)) return;
    setSelected(cell, dragMode === 'select');
    changedDuringDrag.add(key);
  }

  function buildGrid(rangeSet) {
    rangeElement.innerHTML = '';
    const corner = document.createElement('div');
    corner.className = 'header-cell';
    rangeElement.appendChild(corner);

    RANKS.forEach((rank) => {
      const header = document.createElement('div');
      header.className = 'header-cell top-header';
      header.textContent = rank;
      rangeElement.appendChild(header);
    });

    RANKS.forEach((rank, row) => {
      const header = document.createElement('div');
      header.className = 'header-cell';
      header.textContent = rank;
      rangeElement.appendChild(header);

      RANKS.forEach((_columnRank, column) => {
        const key = handKey(row, column);
        const cell = document.createElement('div');
        cell.className = `cell ${row === column ? 'pair' : row < column ? 'suited' : 'off'}`;
        cell.dataset.key = key;
        cell.title = key;
        cell.textContent = key;
        cell.setAttribute('role', 'checkbox');
        cell.setAttribute('aria-label', `Keep ${key}`);
        setSelected(cell, Boolean(rangeSet[key]));
        if (key === latestRuntimeStatus?.handKey) cell.classList.add('current-hand');
        rangeElement.appendChild(cell);
      });
    });

    updateCount();
  }

  function renderRuntimeStatus(runtimeStatus) {
    latestRuntimeStatus = runtimeStatus;
    const message = runtimeStatus?.message || 'Open a PokerNow table.';
    const hand = runtimeStatus?.handKey ? ` (${runtimeStatus.handKey})` : '';
    const autoFoldOff = runtimeStatus?.enabled === false;
    runtimeStatusElement.innerHTML = '<strong>Status:</strong> ';
    const context = runtimeStatus?.position && runtimeStatus?.activePlayerCount
      ? ` · ${runtimeStatus.position}, ${runtimeStatus.activePlayerCount} players`
      : '';
    runtimeStatusElement.append(`${message}${hand}${context}`);
    bypassHandElement.disabled = autoFoldOff || !runtimeStatus?.canBypass || Boolean(runtimeStatus?.bypassed);
    bypassHandElement.classList.toggle('active', autoFoldOff || Boolean(runtimeStatus?.bypassed));
    bypassHandElement.textContent = autoFoldOff
      ? 'Assistant turned off'
      : runtimeStatus?.bypassed
        ? 'Bypassed for this hand'
        : 'Bypass this hand';
    if (!syncEditorToRuntimeContext(runtimeStatus)) buildGrid(currentRangeSet());
  }

  rangeElement.addEventListener('mousedown', (event) => {
    const cell = event.target.closest('.cell');
    if (!cell) return;
    event.preventDefault();
    dragging = true;
    changedDuringDrag = new Set();
    dragMode = cell.classList.contains('selected') ? 'deselect' : 'select';
    applyDrag(cell);
    updateCount();
  });

  rangeElement.addEventListener('mouseover', (event) => {
    if (!dragging) return;
    const cell = event.target.closest('.cell');
    if (!cell) return;
    applyDrag(cell);
    updateCount();
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    saveRange();
  });

  document.getElementById('selectAll').addEventListener('click', () => {
    rangeElement.querySelectorAll('.cell').forEach((cell) => setSelected(cell, true));
    saveRange();
  });

  document.getElementById('selectNone').addEventListener('click', () => {
    rangeElement.querySelectorAll('.cell').forEach((cell) => setSelected(cell, false));
    saveRange();
  });

  document.getElementById('invert').addEventListener('click', () => {
    rangeElement.querySelectorAll('.cell').forEach((cell) => {
      setSelected(cell, !cell.classList.contains('selected'));
    });
    saveRange();
  });

  document.getElementById('resetDefault').addEventListener('click', resetCurrentRangeToDefault);

  document.getElementById('copyRange').addEventListener('click', () => {
    const rangeText = rangeSetToText(selectedRange());
    if (!rangeText) {
      showSaved('No hands selected');
      return;
    }

    copyTextToClipboard(rangeText)
      .then(() => showSaved('Range copied'))
      .catch(() => showSaved('Copy failed'));
  });

  document.getElementById('pasteRange').addEventListener('click', () => {
    readTextFromClipboard()
      .then((rangeText) => {
        const pastedRange = PokerNowAssistantCore.parseRangeText(rangeText);
        if (!PokerNowAssistantCore.hasSelectedHands(pastedRange)) {
          showSaved('No valid hands pasted');
          return;
        }

        buildGrid(pastedRange);
        saveRange('Range pasted');
      })
      .catch(() => {
        const rangeText = window.prompt('Paste range text') || '';
        const pastedRange = PokerNowAssistantCore.parseRangeText(rangeText);
        if (!PokerNowAssistantCore.hasSelectedHands(pastedRange)) {
          showSaved('No valid hands pasted');
          return;
        }

        buildGrid(pastedRange);
        saveRange('Range pasted');
      });
  });

  enabledElement.addEventListener('change', () => {
    chrome.storage.sync.set({ enabled: enabledElement.checked }, () => showSaved());
  });

  soundEnabledElement.addEventListener('change', () => {
    chrome.storage.sync.set({ soundEnabled: soundEnabledElement.checked }, () => showSaved());
  });

  rangeModeElement.addEventListener('change', () => {
    rangeMode = rangeModeElement.value === 'position' ? 'position' : 'single';
    chrome.storage.sync.set({ rangeMode }, () => showSaved());
    renderRangeEditor();
    syncEditorToRuntimeContext(latestRuntimeStatus);
  });

  playerCountElement.addEventListener('change', renderRangeEditor);
  positionElement.addEventListener('change', renderRangeEditor);

  copySingleElement.addEventListener('click', () => {
    buildGrid(singleRangeSet);
    saveRange('Single range copied');
  });

  bypassHandElement.addEventListener('click', () => {
    bypassHandElement.disabled = true;
    enabledElement.checked = false;
    chrome.storage.sync.set({ enabled: false });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab?.id) {
        showSaved('Assistant turned off');
        return;
      }

      chrome.tabs.sendMessage(activeTab.id, { type: 'BYPASS_CURRENT_HAND' }, (response) => {
        if (chrome.runtime.lastError) {
          showSaved('Assistant off; refresh the PokerNow tab');
          return;
        }
        if (!response?.ok) {
          showSaved('Assistant turned off');
          return;
        }
        bypassHandElement.classList.add('active');
        bypassHandElement.textContent = 'Assistant turned off';
        showSaved('Assistant turned off');
      });
    });
  });

  buildGrid({});

  chrome.storage.sync.get({
    enabled: false,
    rangeMode: PokerNowAssistantCore.DEFAULT_RANGE_MODE,
    rangeSet: {},
    positionRanges: {},
    soundEnabled: true,
  }, (items) => {
    enabledElement.checked = Boolean(items.enabled);
    soundEnabledElement.checked = items.soundEnabled !== false;
    rangeMode = items.rangeMode === 'position' ? 'position' : 'single';
    singleRangeSet = items.rangeSet || {};
    savedPositionRanges = normalizePositionRangeOverrides(items.positionRanges);
    positionRanges = PokerNowAssistantCore.mergePositionRanges(savedPositionRanges);
    renderRangeEditor();
    syncEditorToRuntimeContext(latestRuntimeStatus);
  });

  chrome.storage.local.get({ runtimeStatus: null }, (items) => {
    renderRuntimeStatus(items.runtimeStatus);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.runtimeStatus) {
      renderRuntimeStatus(changes.runtimeStatus.newValue);
    }
    if (area === 'sync' && changes.enabled) {
      enabledElement.checked = Boolean(changes.enabled.newValue);
    }
    if (area === 'sync' && changes.rangeMode) {
      rangeMode = changes.rangeMode.newValue === 'position' ? 'position' : 'single';
      renderRangeEditor();
      syncEditorToRuntimeContext(latestRuntimeStatus);
    }
    if (area === 'sync' && changes.positionRanges) {
      savedPositionRanges = normalizePositionRangeOverrides(changes.positionRanges.newValue);
      positionRanges = PokerNowAssistantCore.mergePositionRanges(savedPositionRanges);
      renderRangeEditor();
      syncEditorToRuntimeContext(latestRuntimeStatus);
    }
  });
});
