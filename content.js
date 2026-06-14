const DEFAULTS = {
  enabled: false,
  rangeMode: PokerNowAssistantCore.DEFAULT_RANGE_MODE,
  rangeSet: {},
  positionRanges: PokerNowAssistantCore.DEFAULT_POSITION_RANGES,
  soundEnabled: true,
};
const STATUS_MESSAGES = {
  disabled: 'PokerNow Assistant is disabled.',
  'empty-range': 'Select at least one hand to keep.',
  'unsupported-cards': 'Waiting for a two-card Hold\'em hand.',
  'unreadable-cards': 'Could not read your hole cards.',
  'in-range': 'Hand is in your keep range.',
  'free-check': 'Free Check available; no fold made.',
  'bypass-window': 'Outside range; click bypass now to keep this hand.',
  bypassed: 'PokerNow Assistant bypassed for this hand.',
  postflop: 'Postflop detected; assistant inactive.',
  'street-unknown': 'Street could not be confirmed; no action.',
  'position-unknown': 'Position or active player count could not be confirmed; no action.',
  'outside-range': 'Hand is outside your keep range.',
  'fold-button-missing': 'Waiting for your Fold action.',
  folded: 'Fold clicked.',
};
const state = {
  enabled: DEFAULTS.enabled,
  rangeMode: DEFAULTS.rangeMode,
  rangeSet: DEFAULTS.rangeSet,
  positionRanges: DEFAULTS.positionRanges,
  soundEnabled: DEFAULTS.soundEnabled,
  settingsLoaded: false,
};

let pendingAttempt = null;
let lastStatusSignature = '';
let activeHoleCardsKey = null;
let alertedHoleCardsKey = null;
let bypassedHoleCardsKey = null;
let foldCandidate = null;
let postflopSeenForHand = false;
let lastFoldClickAt = 0;
let lastReturnClickAt = 0;
const FOLD_CLICK_COOLDOWN_MS = 1500;
const RETURN_CLICK_COOLDOWN_MS = 2000;
const BYPASS_WINDOW_MS = 5000;
const TABLE_CONTEXT_CACHE_MS = 3000;
let observer = null;
let contentScriptStopped = false;
let cachedTableContext = null;
let lastTableDiagnostics = {
  ok: false,
  source: 'none',
  reason: 'not-scanned',
};

function stopContentScript() {
  if (contentScriptStopped) return;
  contentScriptStopped = true;
  if (pendingAttempt) window.clearTimeout(pendingAttempt);
  pendingAttempt = null;
  observer?.disconnect();
}

function extensionContextIsValid() {
  try {
    return Boolean(chrome.runtime?.id);
  } catch (_error) {
    return false;
  }
}

function setLocalStorage(value) {
  if (!extensionContextIsValid()) {
    stopContentScript();
    return;
  }

  try {
    chrome.storage.local.set(value, () => {
      if (!extensionContextIsValid()) stopContentScript();
    });
  } catch (_error) {
    stopContentScript();
  }
}

function isActionable(element) {
  if (!(element instanceof HTMLElement) || element.disabled) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

function readCardFromElement(element) {
  const classCard = PokerNowAssistantCore.parsePokerNowCardClasses(element.classList);
  if (classCard) return classCard;

  const rank = element.querySelector('.value')?.textContent?.trim().replace('10', 'T');
  const suit = element.querySelector('.suit')?.textContent?.trim().toLowerCase();
  return PokerNowAssistantCore.parseCardCode(`${rank || ''}${suit || ''}`);
}

function extractPlayerCards() {
  const players = document.querySelectorAll('.table-player.you-player');
  if (players.length !== 1) return null;

  const cardElements = Array.from(
    players[0].querySelectorAll('.table-player-cards .card-container.flipped')
  ).filter((element) => !element.classList.contains('sneak'));

  if (cardElements.length !== 2) return [];
  const cards = cardElements.map(readCardFromElement);
  return cards.every(Boolean) ? cards : null;
}

function setTableDiagnostics(diagnostics) {
  lastTableDiagnostics = {
    ok: false,
    source: 'live',
    scannedAt: Date.now(),
    ...diagnostics,
  };
}

function readTableContext() {
  const heroPlayers = document.querySelectorAll('.table-player.you-player:not(.table-player-seat)');
  const dealerButtons = document.querySelectorAll('.dealer-button-ctn:not(.live-straddle)');
  const participants = Array.from(
    document.querySelectorAll('.table-player:not(.table-player-seat)')
  ).filter((player) => (
    player.classList.contains('fold') ||
    player.querySelectorAll('.table-player-cards .card-container').length >= 2
  ));
  const playerSeatPositions = participants
    .map((player) => PokerNowAssistantCore.readSeatPosition(player.classList));
  const heroSeatPosition = heroPlayers.length === 1
    ? PokerNowAssistantCore.readSeatPosition(heroPlayers[0].classList)
    : null;
  const dealerSeatPosition = dealerButtons.length === 1
    ? PokerNowAssistantCore.readDealerPosition(dealerButtons[0].classList)
    : null;
  const diagnostics = {
    ok: false,
    source: 'live',
    reason: 'ok',
    heroCount: heroPlayers.length,
    dealerButtonCount: dealerButtons.length,
    participantCount: participants.length,
    playerSeatPositions,
    invalidSeatCount: playerSeatPositions.filter((position) => position === null).length,
    heroSeatPosition,
    dealerSeatPosition,
    position: null,
    activePlayerCount: null,
  };

  if (heroPlayers.length !== 1) {
    setTableDiagnostics({
      ...diagnostics,
      reason: heroPlayers.length === 0 ? 'hero-missing' : 'hero-ambiguous',
    });
    return null;
  }
  if (dealerButtons.length !== 1) {
    setTableDiagnostics({
      ...diagnostics,
      reason: dealerButtons.length === 0 ? 'dealer-missing' : 'dealer-ambiguous',
    });
    return null;
  }
  if (participants.length < 2) {
    setTableDiagnostics({ ...diagnostics, reason: 'participants-too-low' });
    return null;
  }
  if (playerSeatPositions.some((position) => position === null)) {
    setTableDiagnostics({ ...diagnostics, reason: 'seat-position-unreadable' });
    return null;
  }
  if (heroSeatPosition === null) {
    setTableDiagnostics({ ...diagnostics, reason: 'hero-seat-unreadable' });
    return null;
  }
  if (dealerSeatPosition === null) {
    setTableDiagnostics({ ...diagnostics, reason: 'dealer-seat-unreadable' });
    return null;
  }

  const position = PokerNowAssistantCore.determinePosition({
    playerSeatPositions,
    heroSeatPosition,
    dealerSeatPosition,
  });
  const participantCount = participants.length;
  if (!position) {
    setTableDiagnostics({ ...diagnostics, reason: 'position-unresolved' });
    return null;
  }
  if (participantCount < 2 || participantCount > 10) {
    setTableDiagnostics({
      ...diagnostics,
      reason: 'player-count-unsupported',
      position,
      activePlayerCount: participantCount,
    });
    return null;
  }

  setTableDiagnostics({
    ...diagnostics,
    ok: true,
    reason: 'ok',
    position,
    activePlayerCount: participantCount,
  });

  return {
    position,
    activePlayerCount: participantCount,
    participantCount,
  };
}

function readCachedTableContext(now = Date.now()) {
  if (!cachedTableContext || !activeHoleCardsKey) return null;
  if (cachedTableContext.holeCardsKey !== activeHoleCardsKey) return null;
  const cacheAgeMs = now - cachedTableContext.cachedAt;
  if (cacheAgeMs > TABLE_CONTEXT_CACHE_MS) {
    cachedTableContext = null;
    return null;
  }
  setTableDiagnostics({
    ...lastTableDiagnostics,
    ok: true,
    source: 'cache',
    reason: 'cached-context',
    cacheAgeMs,
    position: cachedTableContext.tableContext.position,
    activePlayerCount: cachedTableContext.tableContext.activePlayerCount,
    participantCount: cachedTableContext.tableContext.participantCount,
  });
  return cachedTableContext.tableContext;
}

function readStableTableContext(hasTwoHoleCards) {
  const tableContext = readTableContext();
  if (tableContext && activeHoleCardsKey) {
    cachedTableContext = {
      holeCardsKey: activeHoleCardsKey,
      tableContext,
      cachedAt: Date.now(),
    };
    return tableContext;
  }

  return hasTwoHoleCards ? readCachedTableContext() : null;
}

function updateHandTracking(cards) {
  if (!Array.isArray(cards) || cards.length !== 2) return;

  const holeCardsKey = cards
    .map((card) => `${card.rankLabel}${card.suit}`)
    .sort()
    .join('|');
  if (holeCardsKey !== activeHoleCardsKey) {
    activeHoleCardsKey = holeCardsKey;
    alertedHoleCardsKey = null;
    bypassedHoleCardsKey = null;
    foldCandidate = null;
    postflopSeenForHand = false;
    cachedTableContext = null;
  }
}

function requestPlayableHandSound() {
  if (!extensionContextIsValid()) {
    stopContentScript();
    return;
  }

  try {
    chrome.runtime.sendMessage({ type: 'PLAY_HAND_ALERT', target: 'background' }, () => {
      void chrome.runtime.lastError;
      if (!extensionContextIsValid()) stopContentScript();
    });
  } catch (_error) {
    stopContentScript();
  }
}

function detectBoardState({ hasTwoHoleCards, foldAvailable }) {
  const boardContainers = Array.from(document.querySelectorAll('.table-cards'));
  let communityCardCount = 0;
  let hasAmbiguousCard = false;
  for (const container of boardContainers) {
    const cardElements = container.querySelectorAll('.card-container');
    for (const cardElement of cardElements) {
      if (readCardFromElement(cardElement)) {
        communityCardCount += 1;
        continue;
      }

      const hasCardData = Array.from(cardElement.classList).some(
        (className) => /^card-s-/i.test(className) || /^card-[shdc]$/i.test(className)
      );
      if (hasCardData || cardElement.classList.contains('flipped')) hasAmbiguousCard = true;
    }
  }

  if (communityCardCount > 0) postflopSeenForHand = true;

  return PokerNowAssistantCore.classifyBoardObservation({
    boardContainerCount: boardContainers.length,
    communityCardCount,
    hasAmbiguousCard,
    hasTwoHoleCards,
    foldAvailable,
    postflopSeen: postflopSeenForHand,
  });
}

function findUniqueActionButton(actionClass) {
  const buttons = Array.from(
    document.querySelectorAll(`.game-decisions-ctn button.action-button.${actionClass}`)
  ).filter(isActionable);
  return buttons.length === 1 ? buttons[0] : null;
}

function returnFromAwayIfNeeded() {
  if (!state.enabled) return false;
  const returnButton = Array.from(document.querySelectorAll('button')).find(
    (button) => isActionable(button) && PokerNowAssistantCore.isImBackButtonText(button.textContent)
  );
  if (!returnButton) return false;

  const now = Date.now();
  if (PokerNowAssistantCore.shouldClickImBackButton({
    enabled: state.enabled,
    text: returnButton.textContent,
    actionable: true,
    lastClickAt: lastReturnClickAt,
    now,
    cooldownMs: RETURN_CLICK_COOLDOWN_MS,
  })) {
    lastReturnClickAt = now;
    console.info("PokerNow Assistant: clicking I'm Back");
    returnButton.click();
  }
  return true;
}

function setRuntimeStatus(reason, handKey = null, tableContext = null) {
  const handBypassed = PokerNowAssistantCore.isHandBypassed(activeHoleCardsKey, bypassedHoleCardsKey);
  const signature = [
    reason,
    handKey || '',
    activeHoleCardsKey || '',
    handBypassed,
    state.enabled,
    state.rangeMode,
    tableContext?.position || '',
    tableContext?.activePlayerCount || '',
    lastTableDiagnostics?.source || '',
    lastTableDiagnostics?.reason || '',
    lastTableDiagnostics?.heroCount ?? '',
    lastTableDiagnostics?.dealerButtonCount ?? '',
    lastTableDiagnostics?.participantCount ?? '',
  ].join(':');
  if (signature === lastStatusSignature) return;
  lastStatusSignature = signature;

  const runtimeStatus = {
    reason,
    message: STATUS_MESSAGES[reason] || reason,
    handKey,
    canBypass: Boolean(activeHoleCardsKey),
    bypassed: handBypassed,
    enabled: state.enabled,
    rangeMode: state.rangeMode,
    position: tableContext?.position || null,
    activePlayerCount: tableContext?.activePlayerCount || null,
    participantCount: tableContext?.participantCount || null,
    diagnostics: state.rangeMode === 'position' ? lastTableDiagnostics : null,
    updatedAt: Date.now(),
  };

  setLocalStorage({ runtimeStatus });
}

function attemptAssistantAction() {
  if (contentScriptStopped || !extensionContextIsValid()) {
    stopContentScript();
    return;
  }
  if (!state.settingsLoaded) return;
  if (returnFromAwayIfNeeded()) return;

  const cards = extractPlayerCards();
  updateHandTracking(cards);
  if (PokerNowAssistantCore.isHandBypassed(activeHoleCardsKey, bypassedHoleCardsKey)) {
    setRuntimeStatus('bypassed', PokerNowAssistantCore.cardsToKey(cards[0], cards[1]));
    return;
  }
  const foldButton = findUniqueActionButton('fold');
  const boardContext = {
    hasTwoHoleCards: Array.isArray(cards) && cards.length === 2,
    foldAvailable: Boolean(foldButton),
  };
  const boardState = detectBoardState(boardContext);
  const tableContext = state.rangeMode === 'position'
    ? readStableTableContext(boardContext.hasTwoHoleCards)
    : null;
  const resolvedRange = PokerNowAssistantCore.resolveRangeSet({
    rangeMode: state.rangeMode,
    rangeSet: state.rangeSet,
    positionRanges: state.positionRanges,
    tableContext,
  });
  const handKey = Array.isArray(cards) && cards.length === 2
    ? PokerNowAssistantCore.cardsToKey(cards[0], cards[1])
    : null;
  if (resolvedRange.reason && state.enabled && boardState === 'preflop') {
    foldCandidate = null;
    setRuntimeStatus(resolvedRange.reason, handKey, tableContext);
    return;
  }
  if (PokerNowAssistantCore.shouldPlayHandAlert({
    soundEnabled: state.soundEnabled,
    rangeSet: resolvedRange.rangeSet,
    handKey,
    activeHandKey: activeHoleCardsKey,
    alertedHandKey: alertedHoleCardsKey,
    boardState,
  })) {
    alertedHoleCardsKey = activeHoleCardsKey;
    requestPlayableHandSound();
  }
  const checkButton = findUniqueActionButton('check');
  const decision = PokerNowAssistantCore.shouldFoldHand({
    enabled: state.enabled,
    rangeSet: resolvedRange.rangeSet,
    cards,
    checkAvailable: Boolean(checkButton),
    boardState,
  });

  if (!decision.fold) {
    foldCandidate = null;
    setRuntimeStatus(decision.reason, decision.handKey, tableContext);
    return;
  }

  if (!foldButton) {
    foldCandidate = null;
    setRuntimeStatus('fold-button-missing', decision.handKey, tableContext);
    return;
  }
  if (PokerNowAssistantCore.isFoldClickCoolingDown({
    lastFoldClickAt,
    now: Date.now(),
    cooldownMs: FOLD_CLICK_COOLDOWN_MS,
  })) return;

  if (PokerNowAssistantCore.isHandBypassed(activeHoleCardsKey, bypassedHoleCardsKey)) {
    foldCandidate = null;
    setRuntimeStatus('bypassed', decision.handKey, tableContext);
    return;
  }

  const now = Date.now();
  if (!foldCandidate || foldCandidate.holeCardsKey !== activeHoleCardsKey) {
    foldCandidate = {
      holeCardsKey: activeHoleCardsKey,
      foldAt: now + BYPASS_WINDOW_MS,
    };
    setRuntimeStatus('bypass-window', decision.handKey, tableContext);
    scheduleAttempt(BYPASS_WINDOW_MS);
    return;
  }
  if (now < foldCandidate.foldAt) {
    setRuntimeStatus('bypass-window', decision.handKey, tableContext);
    scheduleAttempt(foldCandidate.foldAt - now);
    return;
  }

  const finalCards = extractPlayerCards();
  const finalBoardState = detectBoardState({
    hasTwoHoleCards: Array.isArray(finalCards) && finalCards.length === 2,
    foldAvailable: isActionable(foldButton),
  });
  if (!PokerNowAssistantCore.canExecuteFold(finalBoardState)) {
    const reason = finalBoardState === 'postflop' ? 'postflop' : 'street-unknown';
    setRuntimeStatus(reason, decision.handKey, tableContext);
    return;
  }

  lastFoldClickAt = Date.now();
  foldCandidate = null;
  setRuntimeStatus('folded', decision.handKey, tableContext);
  console.info(`PokerNow Assistant: folding ${decision.handKey}`);
  foldButton.click();
}

function scheduleAttempt(delayMs = 150) {
  if (contentScriptStopped) return;
  if (!PokerNowAssistantCore.shouldScheduleAttempt(pendingAttempt)) return;
  pendingAttempt = window.setTimeout(() => {
    pendingAttempt = null;
    attemptAssistantAction();
  }, Math.max(0, delayMs));
}

observer = new MutationObserver(() => scheduleAttempt());
observer.observe(document.body, { childList: true, subtree: true, attributes: true });

try {
  chrome.storage.sync.get(DEFAULTS, (items) => {
    if (!extensionContextIsValid()) {
      stopContentScript();
      return;
    }
    state.enabled = Boolean(items.enabled);
    state.rangeMode = items.rangeMode === 'position' ? 'position' : 'single';
    state.rangeSet = items.rangeSet || {};
    state.positionRanges = PokerNowAssistantCore.mergePositionRanges(items.positionRanges);
    state.soundEnabled = items.soundEnabled !== false;
    state.settingsLoaded = true;
    scheduleAttempt();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      if (changes.enabled) state.enabled = Boolean(changes.enabled.newValue);
      if (changes.rangeMode) {
        state.rangeMode = changes.rangeMode.newValue === 'position' ? 'position' : 'single';
      }
      if (changes.rangeSet) state.rangeSet = changes.rangeSet.newValue || {};
      if (changes.positionRanges) {
        state.positionRanges = PokerNowAssistantCore.mergePositionRanges(changes.positionRanges.newValue);
      }
      if (changes.soundEnabled) state.soundEnabled = Boolean(changes.soundEnabled.newValue);
      scheduleAttempt();
      return;
    }

  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'BYPASS_CURRENT_HAND') return false;
    const cards = extractPlayerCards();
    updateHandTracking(cards);
    state.enabled = false;
    bypassedHoleCardsKey = null;
    foldCandidate = null;
    if (pendingAttempt) window.clearTimeout(pendingAttempt);
    pendingAttempt = null;
    const handKey = Array.isArray(cards) && cards.length === 2
      ? PokerNowAssistantCore.cardsToKey(cards[0], cards[1])
      : null;
    setRuntimeStatus('disabled', handKey);
    sendResponse({ ok: true, handKey, enabled: false });
    return false;
  });
} catch (_error) {
  stopContentScript();
}

console.info('PokerNow Assistant loaded');
