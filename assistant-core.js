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
  const POSITION_ORDER = ['UTG', 'UTG+1', 'UTG+2', 'UTG+3', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  const HAND_KEYS = RANKS.flatMap((rowRank, row) => RANKS.map((columnRank, column) => {
    if (row === column) return `${rowRank}${columnRank}`;
    if (row < column) return `${rowRank}${columnRank}s`;
    return `${columnRank}${rowRank}o`;
  }));
  const ALL_HANDS_RANGE_SET = Object.fromEntries(HAND_KEYS.map((key) => [key, true]));
  const BB_DEFAULT_RANGE_KEYS = Array.from({ length: 7 }, (_value, index) => `${index + 2}:BB`);
  const RFI_RANGE_TEXT_BY_POSITION = {
    '2:SB': '22+, A2s+, K2s+, Q2s+, J2s+, T2s+, 92s+, 82s+, 72s+, 62s+, 52s+, 42s+, 32s, A2o+, K2o+, Q5o+, J7o+, T7o+, 96o+, 86o+, 75o+, 65o, 54o',
    '3:BTN': '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 86s+, 75s+, 64s+, 54s, A2o+, K7o+, Q8o+, J8o+, T8o+, 98o, 87o',
    '3:SB': '22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 95s+, 85s+, 74s+, 64s+, 53s+, 43s, A2o+, K6o+, Q8o+, J8o+, T8o+, 97o+, 87o, 76o',
    '4:CO': '22+, A2s+, K7s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, 65s, A8o+, KTo+, QTo+, JTo',
    '4:BTN': '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 86s+, 75s+, 64s+, 54s, A2o+, K7o+, Q8o+, J8o+, T8o+, 98o, 87o',
    '4:SB': '22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 95s+, 85s+, 74s+, 64s+, 53s+, 43s, A2o+, K6o+, Q8o+, J8o+, T8o+, 97o+, 87o, 76o',
    '5:HJ': '44+, A7s+, K9s+, Q9s+, J9s+, T9s, 98s, 87s, ATo+, KJo+, QJo',
    '5:CO': '22+, A2s+, K7s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, 65s, A8o+, KTo+, QTo+, JTo',
    '5:BTN': '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 86s+, 75s+, 64s+, 54s, A2o+, K7o+, Q8o+, J8o+, T8o+, 98o, 87o',
    '5:SB': '22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 95s+, 85s+, 74s+, 64s+, 53s+, 43s, A2o+, K6o+, Q8o+, J8o+, T8o+, 97o+, 87o, 76o',
    '6:LJ': '55+, A9s+, KTs+, QTs+, JTs, T9s, 98s, AJo+, KQo',
    '6:HJ': '44+, A7s+, K9s+, Q9s+, J9s+, T9s, 98s, 87s, ATo+, KJo+, QJo',
    '6:CO': '22+, A2s+, K7s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, 65s, A8o+, KTo+, QTo+, JTo',
    '6:BTN': '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 86s+, 75s+, 64s+, 54s, A2o+, K7o+, Q8o+, J8o+, T8o+, 98o, 87o',
    '6:SB': '22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 95s+, 85s+, 74s+, 64s+, 53s+, 43s, A2o+, K6o+, Q8o+, J8o+, T8o+, 97o+, 87o, 76o',
    '7:UTG': '77+, AJs+, KQs, AQo+',
    '7:LJ': '55+, A9s+, KTs+, QTs+, JTs, T9s, 98s, AJo+, KQo',
    '7:HJ': '44+, A7s+, K9s+, Q9s+, J9s+, T9s, 98s, 87s, ATo+, KJo+, QJo',
    '7:CO': '22+, A2s+, K7s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, 65s, A8o+, KTo+, QTo+, JTo',
    '7:BTN': '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 86s+, 75s+, 64s+, 54s, A2o+, K7o+, Q8o+, J8o+, T8o+, 98o, 87o',
    '7:SB': '22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 95s+, 85s+, 74s+, 64s+, 53s+, 43s, A2o+, K6o+, Q8o+, J8o+, T8o+, 97o+, 87o, 76o',
    '8:UTG': '77+, AJs+, KQs, AQo+',
    '8:UTG+1': '66+, ATs+, KJs+, QJs, JTs, T9s, AJo+, KQo',
    '8:LJ': '55+, A9s+, KTs+, QTs+, JTs, T9s, 98s, AJo+, KQo',
    '8:HJ': '44+, A7s+, K9s+, Q9s+, J9s+, T9s, 98s, 87s, ATo+, KJo+, QJo',
    '8:CO': '22+, A2s+, K7s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, 65s, A8o+, KTo+, QTo+, JTo',
    '8:BTN': '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 86s+, 75s+, 64s+, 54s, A2o+, K7o+, Q8o+, J8o+, T8o+, 98o, 87o',
    '8:SB': '22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 95s+, 85s+, 74s+, 64s+, 53s+, 43s, A2o+, K6o+, Q8o+, J8o+, T8o+, 97o+, 87o, 76o',
  };

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

  function handKeyFromRanks(firstRank, secondRank, suitedness) {
    if (!RANK_VALUES[firstRank] || !RANK_VALUES[secondRank]) return null;
    if (firstRank === secondRank) return `${firstRank}${secondRank}`;

    const highRank = RANK_VALUES[firstRank] > RANK_VALUES[secondRank] ? firstRank : secondRank;
    const lowRank = highRank === firstRank ? secondRank : firstRank;
    return `${highRank}${lowRank}${suitedness}`;
  }

  function rankLabelsBetween(startRank, endRank) {
    const startValue = RANK_VALUES[startRank];
    const endValue = RANK_VALUES[endRank];
    if (!startValue || !endValue) return [];

    const minValue = Math.min(startValue, endValue);
    const maxValue = Math.max(startValue, endValue);
    return Object.keys(RANK_VALUES).filter((rank) => (
      RANK_VALUES[rank] >= minValue && RANK_VALUES[rank] <= maxValue
    ));
  }

  function addExactHand(rangeSet, firstRank, secondRank, suitedness = '') {
    const key = handKeyFromRanks(firstRank, secondRank, suitedness);
    if (key && HAND_KEYS.includes(key)) rangeSet[key] = true;
  }

  function addPairPlus(rangeSet, rank) {
    Object.keys(RANK_VALUES)
      .filter((pairRank) => RANK_VALUES[pairRank] >= RANK_VALUES[rank])
      .forEach((pairRank) => { rangeSet[`${pairRank}${pairRank}`] = true; });
  }

  function addNonPairPlus(rangeSet, highRank, lowRank, suitedness) {
    Object.keys(RANK_VALUES)
      .filter((rank) => (
        RANK_VALUES[rank] >= RANK_VALUES[lowRank] &&
        RANK_VALUES[rank] < RANK_VALUES[highRank]
      ))
      .forEach((rank) => addExactHand(rangeSet, highRank, rank, suitedness));
  }

  function addRangeToken(rangeSet, token) {
    const trimmed = String(token || '').trim();
    if (!trimmed) return;

    const exactPair = trimmed.match(/^([2-9TJQKA])\1$/);
    if (exactPair) {
      addExactHand(rangeSet, exactPair[1], exactPair[1]);
      return;
    }

    const pairPlus = trimmed.match(/^([2-9TJQKA])\1\+$/);
    if (pairPlus) {
      addPairPlus(rangeSet, pairPlus[1]);
      return;
    }

    const pairRange = trimmed.match(/^([2-9TJQKA])\1-([2-9TJQKA])\2$/);
    if (pairRange) {
      rankLabelsBetween(pairRange[1], pairRange[2]).forEach((rank) => {
        addExactHand(rangeSet, rank, rank);
      });
      return;
    }

    const exactNonPair = trimmed.match(/^([2-9TJQKA])([2-9TJQKA])([so])$/);
    if (exactNonPair) {
      addExactHand(rangeSet, exactNonPair[1], exactNonPair[2], exactNonPair[3]);
      return;
    }

    const nonPairPlus = trimmed.match(/^([2-9TJQKA])([2-9TJQKA])([so])\+$/);
    if (nonPairPlus) {
      addNonPairPlus(rangeSet, nonPairPlus[1], nonPairPlus[2], nonPairPlus[3]);
      return;
    }

    const nonPairRange = trimmed.match(/^([2-9TJQKA])([2-9TJQKA])([so])-([2-9TJQKA])([2-9TJQKA])\3$/);
    if (nonPairRange && nonPairRange[1] === nonPairRange[4]) {
      rankLabelsBetween(nonPairRange[2], nonPairRange[5]).forEach((rank) => {
        if (rank !== nonPairRange[1]) addExactHand(rangeSet, nonPairRange[1], rank, nonPairRange[3]);
      });
    }
  }

  function parseRangeText(rangeText) {
    const rangeSet = {};
    String(rangeText || '')
      .split(/[,\s;]+/)
      .forEach((token) => addRangeToken(rangeSet, token));
    return rangeSet;
  }

  function buildDefaultPositionRanges() {
    const defaultRanges = Object.fromEntries(
      Object.entries(RFI_RANGE_TEXT_BY_POSITION).map(([rangeKey, rangeText]) => [
        rangeKey,
        encodeRangeSet(parseRangeText(rangeText)),
      ])
    );
    const encodedAllHandsRange = encodeRangeSet(ALL_HANDS_RANGE_SET);
    BB_DEFAULT_RANGE_KEYS.forEach((rangeKey) => {
      defaultRanges[rangeKey] = encodedAllHandsRange;
    });
    return defaultRanges;
  }

  const DEFAULT_RANGE_MODE = 'position';
  const DEFAULT_POSITION_RANGES = buildDefaultPositionRanges();

  function mergePositionRanges(positionRanges) {
    return {
      ...DEFAULT_POSITION_RANGES,
      ...(positionRanges || {}),
    };
  }

  function positionsForPlayerCount(playerCount) {
    if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 10) return [];
    if (playerCount === 2) return ['SB', 'BB'];

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
    DEFAULT_POSITION_RANGES,
    DEFAULT_RANGE_MODE,
    RFI_RANGE_TEXT_BY_POSITION,
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
    parseRangeText,
    positionRangeKey,
    positionsForPlayerCount,
    mergePositionRanges,
    readDealerPosition,
    readSeatPosition,
    resolveRangeSet,
    shouldPlayHandAlert,
    shouldClickImBackButton,
    shouldScheduleAttempt,
    shouldFoldHand,
  };
});
