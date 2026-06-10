(function exposeAssistantCore(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.PokerNowAssistantCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const RANK_VALUES = {
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    T: 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14,
  };
  const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
  const POSITION_ORDER = ['UTG', 'UTG+1', 'UTG+2', 'UTG+3', 'LJ', 'HJ', 'CO', 'BTN', 'BTN/SB', 'SB', 'BB'];
  const HAND_KEYS = RANKS.flatMap((rowRank, row) => RANKS.map((columnRank, column) => {
    if (row === column) return `${rowRank}${columnRank}`;
    if (row < column) return `${rowRank}${columnRank}s`;
    return `${columnRank}${rowRank}o`;
  }));

  function parseCardCode(value) {
    const match = String(value || '').trim().match(/^([2-9TJQKA])([shdc])$/i);
    if (!match) return null;

    const rank = match[1].toUpperCase();
    return {
      rank: RANK_VALUES[rank],
      rankLabel: rank,
      suit: match[2].toLowerCase(),
    };
  }

  function rankValueToLabel(value) {
    return Object.keys(RANK_VALUES).find((rank) => RANK_VALUES[rank] === value) || null;
  }

  function parsePokerNowCardClasses(classNames) {
    let rank = null;
    let suit = null;

    for (const className of classNames || []) {
      const rankMatch = String(className).match(/^card-s-([2-9TJQKA])$/i);
      const suitMatch = String(className).match(/^card-([shdc])$/i);
      if (rankMatch) rank = rankMatch[1];
      if (suitMatch) suit = suitMatch[1];
    }

    return parseCardCode(`${rank || ''}${suit || ''}`);
  }

  function cardsToKey(cardA, cardB) {
    if (!cardA || !cardB) return null;

    const firstRank = Number(cardA.rank);
    const secondRank = Number(cardB.rank);
    const firstLabel = cardA.rankLabel || rankValueToLabel(firstRank);
    const secondLabel = cardB.rankLabel || rankValueToLabel(secondRank);
    if (!firstLabel || !secondLabel) return null;

    if (firstRank === secondRank) return `${firstLabel}${secondLabel}`;

    const highCard = firstRank > secondRank ? cardA : cardB;
    const lowCard = highCard === cardA ? cardB : cardA;
    const highLabel = highCard.rankLabel || rankValueToLabel(highCard.rank);
    const lowLabel = lowCard.rankLabel || rankValueToLabel(lowCard.rank);
    const suitedness = cardA.suit === cardB.suit ? 's' : 'o';
    return `${highLabel}${lowLabel}${suitedness}`;
  }

  function hasSelectedHands(rangeSet) {
    return Boolean(rangeSet && Object.keys(rangeSet).some((key) => rangeSet[key]));
  }

  function encodeRangeSet(rangeSet) {
    const bytes = new Uint8Array(Math.ceil(HAND_KEYS.length / 8));
    HAND_KEYS.forEach((key, index) => {
      if (rangeSet?.[key]) bytes[Math.floor(index / 8)] |= 1 << (index % 8);
    });

    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    if (typeof btoa === 'function') return btoa(binary);
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    return '';
  }

  function decodeRangeSet(encoded) {
    if (!encoded || typeof encoded !== 'string') return {};

    let bytes;
    try {
      if (typeof atob === 'function') {
        const binary = atob(encoded);
        bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      } else if (typeof Buffer !== 'undefined') {
        bytes = Uint8Array.from(Buffer.from(encoded, 'base64'));
      } else {
        return {};
      }
    } catch (_error) {
      return {};
    }

    const rangeSet = {};
    HAND_KEYS.forEach((key, index) => {
      if (bytes[Math.floor(index / 8)] & (1 << (index % 8))) rangeSet[key] = true;
    });
    return rangeSet;
  }

  function positionsForPlayerCount(playerCount) {
    if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 10) return [];
    if (playerCount === 2) return ['BTN/SB', 'BB'];

    const earlyPositionCount = playerCount - 3;
    const earlyPositions = {
      0: [],
      1: ['CO'],
      2: ['HJ', 'CO'],
      3: ['LJ', 'HJ', 'CO'],
      4: ['UTG', 'LJ', 'HJ', 'CO'],
      5: ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO'],
      6: ['UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO'],
      7: ['UTG', 'UTG+1', 'UTG+2', 'UTG+3', 'LJ', 'HJ', 'CO'],
    }[earlyPositionCount];
    return [...earlyPositions, 'BTN', 'SB', 'BB'];
  }

  function readSeatPosition(classNames) {
    const positions = Array.from(classNames || [])
      .map((className) => String(className).match(/^table-player-(\d+)$/))
      .filter(Boolean)
      .map((match) => Number(match[1]));
    return positions.length === 1 && positions[0] >= 1 && positions[0] <= 10
      ? positions[0]
      : null;
  }

  function readDealerPosition(classNames) {
    const positions = Array.from(classNames || [])
      .map((className) => String(className).match(/^dealer-position-(\d+)$/))
      .filter(Boolean)
      .map((match) => Number(match[1]));
    return positions.length === 1 && positions[0] >= 1 && positions[0] <= 10
      ? positions[0]
      : null;
  }

  function determinePosition({ playerSeatPositions, heroSeatPosition, dealerSeatPosition, seatCount = 10 }) {
    if (!Array.isArray(playerSeatPositions) || playerSeatPositions.length < 2) return null;
    if (![heroSeatPosition, dealerSeatPosition, seatCount].every(Number.isInteger)) return null;
    if (seatCount < 2 || !playerSeatPositions.includes(heroSeatPosition)) return null;

    const uniqueSeats = [...new Set(playerSeatPositions)];
    if (uniqueSeats.length !== playerSeatPositions.length) return null;
    const clockwiseSeats = uniqueSeats.slice().sort((seatA, seatB) => {
      const distanceA = (seatA - dealerSeatPosition + seatCount) % seatCount;
      const distanceB = (seatB - dealerSeatPosition + seatCount) % seatCount;
      return distanceA - distanceB;
    });
    if (clockwiseSeats[0] !== dealerSeatPosition) return null;

    const tablePositions = positionsForPlayerCount(clockwiseSeats.length);
    const positions = clockwiseSeats.length === 2
      ? tablePositions
      : [
        'BTN',
        'SB',
        'BB',
        ...tablePositions.filter((position) => !['BTN', 'SB', 'BB'].includes(position)),
      ];
    const heroIndex = clockwiseSeats.indexOf(heroSeatPosition);
    return heroIndex >= 0 ? positions[heroIndex] || null : null;
  }

  function positionRangeKey(playerCount, position) {
    if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 10) return null;
    if (!POSITION_ORDER.includes(position)) return null;
    return `${playerCount}:${position}`;
  }

  function resolveRangeSet({ rangeMode, rangeSet, positionRanges, tableContext }) {
    if (rangeMode !== 'position') {
      return { rangeSet: rangeSet || {}, reason: null, rangeKey: 'single' };
    }
    if (!tableContext?.position || !Number.isInteger(tableContext?.activePlayerCount)) {
      return { rangeSet: {}, reason: 'position-unknown', rangeKey: null };
    }

    const rangeKey = positionRangeKey(tableContext.activePlayerCount, tableContext.position);
    if (!rangeKey) return { rangeSet: {}, reason: 'position-unknown', rangeKey: null };
    return {
      rangeSet: decodeRangeSet(positionRanges?.[rangeKey]),
      reason: null,
      rangeKey,
    };
  }

  function classifyBoardState(communityCardCount) {
    if (!Number.isInteger(communityCardCount) || communityCardCount < 0) return 'unknown';
    return communityCardCount === 0 ? 'preflop' : 'postflop';
  }

  function classifyBoardObservation({
    boardContainerCount,
    communityCardCount,
    hasAmbiguousCard,
    hasTwoHoleCards,
    foldAvailable,
    postflopSeen,
  }) {
    if (postflopSeen) return 'postflop';
    if (hasAmbiguousCard) return 'unknown';
    if (!Number.isInteger(boardContainerCount) || boardContainerCount < 0) return 'unknown';
    if (!Number.isInteger(communityCardCount) || communityCardCount < 0) return 'unknown';
    if (communityCardCount > 0) return 'postflop';
    if (boardContainerCount > 0) return 'preflop';
    return hasTwoHoleCards && foldAvailable ? 'preflop' : 'unknown';
  }

  function canExecuteFold(boardState) {
    return boardState === 'preflop';
  }

  function isFoldClickCoolingDown({ lastFoldClickAt, now, cooldownMs }) {
    if (![lastFoldClickAt, now, cooldownMs].every(Number.isFinite)) return false;
    return lastFoldClickAt > 0 && now - lastFoldClickAt < cooldownMs;
  }

  function isImBackButtonText(value) {
    const normalized = String(value || '')
      .trim()
      .replace(/[\u2018\u2019\u02bc\uff07]/g, "'");
    return /^i\s*'\s*m\s+back$/i.test(normalized);
  }

  function shouldClickImBackButton({ text, actionable, lastClickAt, now, cooldownMs }) {
    return Boolean(
      actionable &&
      isImBackButtonText(text) &&
      !isFoldClickCoolingDown({ lastFoldClickAt: lastClickAt, now, cooldownMs })
    );
  }

  function isHandBypassed(activeHandKey, bypassedHandKey) {
    return Boolean(activeHandKey && bypassedHandKey && activeHandKey === bypassedHandKey);
  }

  function shouldScheduleAttempt(pendingAttempt) {
    return !pendingAttempt;
  }

  function shouldPlayHandAlert({ soundEnabled, rangeSet, handKey, activeHandKey, alertedHandKey, boardState }) {
    return Boolean(
      soundEnabled &&
      boardState === 'preflop' &&
      handKey &&
      activeHandKey &&
      activeHandKey !== alertedHandKey &&
      rangeSet?.[handKey]
    );
  }

  function shouldFoldHand({ enabled, rangeSet, cards, checkAvailable, boardState }) {
    if (!enabled) return { fold: false, reason: 'disabled', handKey: null };
    if (boardState === 'postflop') return { fold: false, reason: 'postflop', handKey: null };
    if (!canExecuteFold(boardState)) return { fold: false, reason: 'street-unknown', handKey: null };
    if (!hasSelectedHands(rangeSet)) return { fold: false, reason: 'empty-range', handKey: null };
    if (!Array.isArray(cards) || cards.length !== 2) {
      return { fold: false, reason: 'unsupported-cards', handKey: null };
    }

    const handKey = cardsToKey(cards[0], cards[1]);
    if (!handKey) return { fold: false, reason: 'unreadable-cards', handKey: null };
    if (rangeSet[handKey]) return { fold: false, reason: 'in-range', handKey };
    if (checkAvailable) return { fold: false, reason: 'free-check', handKey };

    return { fold: true, reason: 'outside-range', handKey };
  }

  return {
    HAND_KEYS,
    POSITION_ORDER,
    canExecuteFold,
    cardsToKey,
    classifyBoardObservation,
    classifyBoardState,
    decodeRangeSet,
    determinePosition,
    encodeRangeSet,
    hasSelectedHands,
    isHandBypassed,
    isFoldClickCoolingDown,
    isImBackButtonText,
    parseCardCode,
    parsePokerNowCardClasses,
    positionRangeKey,
    positionsForPlayerCount,
    readDealerPosition,
    readSeatPosition,
    resolveRangeSet,
    shouldPlayHandAlert,
    shouldClickImBackButton,
    shouldScheduleAttempt,
    shouldFoldHand,
  };
});
