document.addEventListener('DOMContentLoaded', () => {
  const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
  const enabledElement = document.getElementById('enabled');
  const soundEnabledElement = document.getElementById('soundEnabled');
  const rangeModeElement = document.getElementById('rangeMode');
  const positionControlsElement = document.getElementById('positionControls');
  const playerCountElement = document.getElementById('playerCount');
  const positionElement = document.getElementById('position');
  const copySingleElement = document.getElementById('copySingle');
  const autoFollowContextElement = document.getElementById('autoFollowContext');
  const presetLabelElement = document.getElementById('presetLabel');
  const editingLabelElement = document.getElementById('editingLabel');
  const contextHelpElement = document.getElementById('contextHelp');
  const rangeElement = document.getElementById('range');
  const selectedCountElement = document.getElementById('selectedCount');
  const rangeDiffElement = document.getElementById('rangeDiff');
  const runtimeStatusElement = document.getElementById('runtimeStatus');
  const diagnosticsContentElement = document.getElementById('diagnosticsContent');
  const bypassHandElement = document.getElementById('bypassHand');
  const refreshTableElement = document.getElementById('refreshTable');
  const exportConfigElement = document.getElementById('exportConfig');
  const importConfigElement = document.getElementById('importConfig');
  const configFileElement = document.getElementById('configFile');
  const saveStatusElement = document.getElementById('saveStatus');
  const DIAGNOSTIC_REASON_LABELS = {
    ok: 'Live scan succeeded',
    'not-scanned': 'No scan has run yet',
    'hero-missing': 'Could not find your player node',
    'hero-ambiguous': 'Found multiple current-player nodes',
    'dealer-missing': 'Could not find the dealer button',
    'dealer-ambiguous': 'Found multiple dealer buttons',
    'participants-too-low': 'Fewer than two seated participants found',
    'seat-position-unreadable': 'Could not read every participant seat',
    'hero-seat-unreadable': 'Could not read your seat',
    'dealer-seat-unreadable': 'Could not read the dealer seat',
    'position-unresolved': 'Could not map seats to a poker position',
    'player-count-unsupported': 'Detected player count is unsupported',
    'cached-context': 'Using recent successful scan',
    'position-unknown': 'Position or player count could not be confirmed',
  };
  let dragging = false;
  let dragMode = 'select';
  let changedDuringDrag = new Set();
  let statusTimer = null;
  let rangeMode = PokerNowAssistantCore.DEFAULT_RANGE_MODE;
  let singleRangeSet = {};
  let savedPositionRanges = {};
  let positionRanges = {};
  let autoFollowContext = true;
  let latestRuntimeStatus = null;

  for (let playerCount = 2; playerCount <= 10; playerCount += 1) {
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

  function applySettings(settings) {
    enabledElement.checked = Boolean(settings.enabled);
    soundEnabledElement.checked = settings.soundEnabled !== false;
    rangeMode = settings.rangeMode === 'position' ? 'position' : 'single';
    singleRangeSet = settings.rangeSet || {};
    savedPositionRanges = normalizePositionRangeOverrides(settings.positionRanges);
    positionRanges = PokerNowAssistantCore.mergePositionRanges(savedPositionRanges);
    autoFollowContext = settings.autoFollowContext !== false;
    autoFollowContextElement.checked = autoFollowContext;
    renderRangeEditor();
    syncEditorToRuntimeContext(latestRuntimeStatus);
  }

  function exportConfiguration() {
    const config = PokerNowAssistantCore.createConfigExport({
      enabled: enabledElement.checked,
      rangeMode,
      rangeSet: singleRangeSet,
      positionRanges: savedPositionRanges,
      autoFollowContext,
      soundEnabled: soundEnabledElement.checked,
    });
    if (!config) {
      showSaved('Config export failed');
      return;
    }

    const blob = new Blob([`${JSON.stringify(config, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pokernow-assistant-config-${config.exportedAt.slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    showSaved('Config exported');
  }

  async function importConfiguration(file) {
    const settings = PokerNowAssistantCore.parseConfigImport(await file.text());
    if (!settings) {
      showSaved('Invalid config file');
      return;
    }

    chrome.storage.sync.set(settings, () => {
      if (chrome.runtime.lastError) {
        showSaved('Config import failed');
        return;
      }
      applySettings(settings);
      showSaved('Config imported');
    });
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

  function updateRangeDiff(rangeSet) {
    if (rangeMode !== 'position') {
      rangeDiffElement.textContent = '';
      rangeDiffElement.className = 'range-diff hidden';
      return;
    }

    const defaultRangeSet = defaultRangeSetForCurrentPage();
    let added = 0;
    let removed = 0;
    PokerNowAssistantCore.HAND_KEYS.forEach((key) => {
      const selected = Boolean(rangeSet?.[key]);
      const defaultSelected = Boolean(defaultRangeSet?.[key]);
      if (selected && !defaultSelected) added += 1;
      if (!selected && defaultSelected) removed += 1;
    });

    const matchesDefault = added === 0 && removed === 0;
    rangeDiffElement.textContent = matchesDefault
      ? 'Matches default'
      : `+${added} / -${removed} vs default`;
    rangeDiffElement.title = 'Hands added or removed compared with the built-in default for this page';
    rangeDiffElement.className = `range-diff ${matchesDefault ? 'default' : 'custom'}`;
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
    if (!autoFollowContext) return false;
    if (rangeMode !== 'position') return;

    const activePlayerCount = Number(runtimeStatus?.activePlayerCount);
    const position = runtimeStatus?.position;
    if (!Number.isInteger(activePlayerCount) || activePlayerCount < 2 || activePlayerCount > 10) return;

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
    const currentRange = selectedRange();
    const count = Object.keys(currentRange).length;
    const total = PokerNowAssistantCore.HAND_KEYS.length;
    const percentage = total ? ((count / total) * 100).toFixed(1) : '0.0';
    selectedCountElement.textContent = `${count} / ${total} kept · ${percentage}%`;
    selectedCountElement.classList.toggle('warning', count === 0);
    updatePresetLabel(currentRange);
    updateRangeDiff(currentRange);
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

  function formatDiagnosticValue(value) {
    if (Array.isArray(value)) return value.length ? value.map((item) => item ?? '?').join(', ') : 'None';
    if (value === null || value === undefined || value === '') return 'Unknown';
    return String(value);
  }

  function appendDiagnosticRow(list, label, value) {
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = formatDiagnosticValue(value);
    list.append(term, description);
  }

  function diagnosticsForStatus(runtimeStatus) {
    if (runtimeStatus?.diagnostics) return runtimeStatus.diagnostics;
    if (runtimeStatus?.position && runtimeStatus?.activePlayerCount) {
      return {
        ok: true,
        source: 'status',
        reason: 'ok',
        position: runtimeStatus.position,
        activePlayerCount: runtimeStatus.activePlayerCount,
        participantCount: runtimeStatus.participantCount,
      };
    }
    if (runtimeStatus?.reason === 'position-unknown') {
      return {
        ok: false,
        source: 'status',
        reason: 'position-unknown',
        position: runtimeStatus.position,
        activePlayerCount: runtimeStatus.activePlayerCount,
        participantCount: runtimeStatus.participantCount,
      };
    }
    return null;
  }

  function renderDiagnostics(runtimeStatus) {
    diagnosticsContentElement.innerHTML = '';
    const diagnostics = diagnosticsForStatus(runtimeStatus);
    if (!diagnostics) {
      diagnosticsContentElement.textContent = 'No position scan diagnostics yet.';
      return;
    }

    const list = document.createElement('dl');
    list.className = 'diagnostics-grid';
    const source = diagnostics.source === 'cache'
      ? `Cache (${Math.round(diagnostics.cacheAgeMs || 0)} ms old)`
      : diagnostics.source === 'status'
        ? 'Runtime status'
      : diagnostics.source || 'live';
    appendDiagnosticRow(list, 'Result', diagnostics.ok ? 'OK' : 'Blocked');
    appendDiagnosticRow(list, 'Reason', DIAGNOSTIC_REASON_LABELS[diagnostics.reason] || diagnostics.reason);
    appendDiagnosticRow(list, 'Source', source);
    appendDiagnosticRow(list, 'Hero nodes', diagnostics.heroCount);
    appendDiagnosticRow(list, 'Dealer buttons', diagnostics.dealerButtonCount);
    appendDiagnosticRow(list, 'Participants', diagnostics.participantCount);
    appendDiagnosticRow(list, 'Unreadable seats', diagnostics.invalidSeatCount);
    appendDiagnosticRow(list, 'Hero seat', diagnostics.heroSeatPosition);
    appendDiagnosticRow(list, 'Dealer seat', diagnostics.dealerSeatPosition);
    appendDiagnosticRow(list, 'Participant seats', diagnostics.playerSeatPositions);
    appendDiagnosticRow(list, 'Position', diagnostics.position);
    appendDiagnosticRow(list, 'Player count', diagnostics.activePlayerCount);
    diagnosticsContentElement.appendChild(list);
  }

  function scanBadgeForStatus(runtimeStatus) {
    const diagnostics = diagnosticsForStatus(runtimeStatus);
    if (!diagnostics || diagnostics.reason === 'not-scanned') {
      return { label: 'Scan idle', state: 'idle' };
    }
    if (diagnostics.source === 'cache') {
      return { label: 'Using cache', state: 'cache' };
    }
    if (diagnostics.ok) {
      return { label: 'Scan OK', state: 'ok' };
    }
    return { label: 'Scan blocked', state: 'blocked' };
  }

  function appendScanBadge(runtimeStatus) {
    const badgeState = scanBadgeForStatus(runtimeStatus);
    const badge = document.createElement('span');
    badge.className = `scan-badge ${badgeState.state}`;
    badge.textContent = badgeState.label;
    const reason = diagnosticsForStatus(runtimeStatus)?.reason;
    badge.title = reason
      ? DIAGNOSTIC_REASON_LABELS[reason] || reason
      : 'No position scan diagnostics yet';
    runtimeStatusElement.appendChild(badge);
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
    appendScanBadge(runtimeStatus);
    bypassHandElement.disabled = autoFoldOff || !runtimeStatus?.canBypass || Boolean(runtimeStatus?.bypassed);
    bypassHandElement.classList.toggle('active', autoFoldOff || Boolean(runtimeStatus?.bypassed));
    bypassHandElement.textContent = autoFoldOff
      ? 'Assistant turned off'
      : runtimeStatus?.bypassed
        ? 'Bypassed for this hand'
        : 'Bypass this hand';
    renderDiagnostics(runtimeStatus);
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

  exportConfigElement.addEventListener('click', exportConfiguration);

  importConfigElement.addEventListener('click', () => {
    configFileElement.value = '';
    configFileElement.click();
  });

  configFileElement.addEventListener('change', () => {
    const file = configFileElement.files?.[0];
    if (!file) return;
    importConfiguration(file).catch(() => showSaved('Config import failed'));
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

  autoFollowContextElement.addEventListener('change', () => {
    autoFollowContext = autoFollowContextElement.checked;
    chrome.storage.sync.set({ autoFollowContext }, () => showSaved());
    if (autoFollowContext) syncEditorToRuntimeContext(latestRuntimeStatus);
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

  refreshTableElement.addEventListener('click', () => {
    refreshTableElement.disabled = true;
    chrome.storage.local.set({ runtimeStatus: null }, () => {
      renderRuntimeStatus(null);
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab?.id) {
          refreshTableElement.disabled = false;
          showSaved('No active tab');
          return;
        }

        chrome.tabs.reload(activeTab.id, {}, () => {
          if (chrome.runtime.lastError) {
            refreshTableElement.disabled = false;
            showSaved('Refresh failed');
            return;
          }
          showSaved('Table refreshed');
          window.close();
        });
      });
    });
  });

  buildGrid({});

  chrome.storage.sync.get({
    enabled: false,
    rangeMode: PokerNowAssistantCore.DEFAULT_RANGE_MODE,
    rangeSet: {},
    positionRanges: {},
    autoFollowContext: true,
    soundEnabled: true,
  }, (items) => {
    applySettings(items);
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
    if (area === 'sync' && changes.soundEnabled) {
      soundEnabledElement.checked = changes.soundEnabled.newValue !== false;
    }
    if (area === 'sync' && changes.rangeSet) {
      singleRangeSet = changes.rangeSet.newValue || {};
      if (rangeMode === 'single') renderRangeEditor();
    }
    if (area === 'sync' && changes.autoFollowContext) {
      autoFollowContext = changes.autoFollowContext.newValue !== false;
      autoFollowContextElement.checked = autoFollowContext;
      if (autoFollowContext) syncEditorToRuntimeContext(latestRuntimeStatus);
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
