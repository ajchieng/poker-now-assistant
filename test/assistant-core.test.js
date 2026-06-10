const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canExecuteFold,
  cardsToKey,
  classifyBoardObservation,
  classifyBoardState,
  decodeRangeSet,
  determinePosition,
  encodeRangeSet,
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
} = require('../assistant-core');

test('parses PokerNow card codes', () => {
  assert.deepEqual(parseCardCode('Ah'), { rank: 14, rankLabel: 'A', suit: 'h' });
  assert.deepEqual(parseCardCode('tc'), { rank: 10, rankLabel: 'T', suit: 'c' });
  assert.equal(parseCardCode('10h'), null);
});

test('parses PokerNow card classes from the current site markup', () => {
  assert.deepEqual(
    parsePokerNowCardClasses(['card-container', 'card-h', 'card-s-A', 'flipped', 'card-p1']),
    { rank: 14, rankLabel: 'A', suit: 'h' }
  );
  assert.equal(parsePokerNowCardClasses(['card-container', 'flipped']), null);
});

test('normalizes hand keys independent of card order', () => {
  const aceHearts = parseCardCode('Ah');
  const kingHearts = parseCardCode('Kh');
  const kingClubs = parseCardCode('Kc');

  assert.equal(cardsToKey(aceHearts, kingHearts), 'AKs');
  assert.equal(cardsToKey(kingClubs, aceHearts), 'AKo');
  assert.equal(cardsToKey(kingHearts, kingClubs), 'KK');
});

test('reads PokerNow player and dealer positions from current class names', () => {
  assert.equal(readSeatPosition(['table-player', 'table-player-7', 'you-player']), 7);
  assert.equal(readDealerPosition(['dealer-button-ctn', 'dealer-position-10']), 10);
  assert.equal(readSeatPosition(['table-player', 'table-player-seat']), null);
  assert.equal(readDealerPosition(['dealer-button-ctn', 'live-straddle']), null);
});

test('maps clockwise PokerNow seats to conventional six-max positions', () => {
  const playerSeatPositions = [1, 2, 4, 6, 8, 10];
  const base = { playerSeatPositions, dealerSeatPosition: 8 };

  assert.equal(determinePosition({ ...base, heroSeatPosition: 8 }), 'BTN');
  assert.equal(determinePosition({ ...base, heroSeatPosition: 10 }), 'SB');
  assert.equal(determinePosition({ ...base, heroSeatPosition: 1 }), 'BB');
  assert.equal(determinePosition({ ...base, heroSeatPosition: 2 }), 'LJ');
  assert.equal(determinePosition({ ...base, heroSeatPosition: 4 }), 'HJ');
  assert.equal(determinePosition({ ...base, heroSeatPosition: 6 }), 'CO');
});

test('handles heads-up button/small-blind and fails closed without the dealer player', () => {
  assert.equal(determinePosition({
    playerSeatPositions: [4, 9],
    dealerSeatPosition: 9,
    heroSeatPosition: 9,
  }), 'BTN/SB');
  assert.equal(determinePosition({
    playerSeatPositions: [4, 9],
    dealerSeatPosition: 9,
    heroSeatPosition: 4,
  }), 'BB');
  assert.equal(determinePosition({
    playerSeatPositions: [4, 9],
    dealerSeatPosition: 7,
    heroSeatPosition: 4,
  }), null);
});

test('provides standard position labels for table sizes', () => {
  assert.deepEqual(positionsForPlayerCount(2), ['BTN/SB', 'BB']);
  assert.deepEqual(positionsForPlayerCount(6), ['LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
  assert.deepEqual(
    positionsForPlayerCount(9),
    ['UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']
  );
});

test('encodes position ranges compactly and resolves the current profile', () => {
  const rangeSet = { AA: true, AKs: true, '72o': true };
  const encoded = encodeRangeSet(rangeSet);
  assert.ok(encoded.length < 40);
  assert.deepEqual(decodeRangeSet(encoded), rangeSet);

  const rangeKey = positionRangeKey(4, 'BTN');
  assert.equal(rangeKey, '4:BTN');
  assert.deepEqual(resolveRangeSet({
    rangeMode: 'position',
    rangeSet: { KK: true },
    positionRanges: { [rangeKey]: encoded },
    tableContext: { activePlayerCount: 4, position: 'BTN' },
  }), { rangeSet, reason: null, rangeKey });
});

test('position mode fails closed when table context is unavailable', () => {
  assert.deepEqual(resolveRangeSet({
    rangeMode: 'position',
    rangeSet: { AA: true },
    positionRanges: {},
    tableContext: null,
  }), { rangeSet: {}, reason: 'position-unknown', rangeKey: null });
  assert.deepEqual(resolveRangeSet({
    rangeMode: 'single',
    rangeSet: { AA: true },
  }), { rangeSet: { AA: true }, reason: null, rangeKey: 'single' });
});

test('does nothing while disabled or when the keep range is empty', () => {
  const cards = [parseCardCode('7h'), parseCardCode('2c')];
  assert.equal(shouldFoldHand({ enabled: false, rangeSet: { AA: true }, cards }).reason, 'disabled');
  assert.equal(
    shouldFoldHand({ enabled: true, rangeSet: {}, cards, boardState: 'preflop' }).reason,
    'empty-range'
  );
});

test('keeps selected hands and folds unselected hands', () => {
  const rangeSet = { AA: true, AKs: true };

  assert.deepEqual(
    shouldFoldHand({
      enabled: true,
      rangeSet,
      cards: [parseCardCode('As'), parseCardCode('Ks')],
      checkAvailable: false,
      boardState: 'preflop',
    }),
    { fold: false, reason: 'in-range', handKey: 'AKs' }
  );

  assert.deepEqual(
    shouldFoldHand({
      enabled: true,
      rangeSet,
      cards: [parseCardCode('7h'), parseCardCode('2c')],
      checkAvailable: false,
      boardState: 'preflop',
    }),
    { fold: true, reason: 'outside-range', handKey: '72o' }
  );
});

test('never folds when a free Check is available', () => {
  const result = shouldFoldHand({
    enabled: true,
    rangeSet: { AA: true },
    cards: [parseCardCode('7h'), parseCardCode('2c')],
    checkAvailable: true,
    boardState: 'preflop',
  });

  assert.deepEqual(result, { fold: false, reason: 'free-check', handKey: '72o' });
});

test('classifies zero board cards as preflop and any board card as postflop', () => {
  assert.equal(classifyBoardState(0), 'preflop');
  assert.equal(classifyBoardState(3), 'postflop');
  assert.equal(classifyBoardState(4), 'postflop');
  assert.equal(classifyBoardState(5), 'postflop');
  assert.equal(classifyBoardState(null), 'unknown');
  assert.equal(classifyBoardState(-1), 'unknown');
});

test('allows early preflop action when PokerNow has not mounted an empty board container', () => {
  assert.equal(
    classifyBoardObservation({
      boardContainerCount: 0,
      communityCardCount: 0,
      hasAmbiguousCard: false,
      hasTwoHoleCards: true,
      foldAvailable: true,
      postflopSeen: false,
    }),
    'preflop'
  );
});

test('missing board markup fails closed without complete preflop signals', () => {
  const baseObservation = {
    boardContainerCount: 0,
    communityCardCount: 0,
    hasAmbiguousCard: false,
    hasTwoHoleCards: true,
    foldAvailable: true,
    postflopSeen: false,
  };

  assert.equal(classifyBoardObservation({ ...baseObservation, hasTwoHoleCards: false }), 'unknown');
  assert.equal(classifyBoardObservation({ ...baseObservation, foldAvailable: false }), 'unknown');
  assert.equal(classifyBoardObservation({ ...baseObservation, hasAmbiguousCard: true }), 'unknown');
});

test('postflop lock survives transient board removal for the same hand', () => {
  assert.equal(
    classifyBoardObservation({
      boardContainerCount: 0,
      communityCardCount: 0,
      hasAmbiguousCard: false,
      hasTwoHoleCards: true,
      foldAvailable: true,
      postflopSeen: true,
    }),
    'postflop'
  );
});

test('never folds on the flop, turn, river, or an unknown street', () => {
  const baseDecision = {
    enabled: true,
    rangeSet: { AA: true },
    cards: [parseCardCode('7h'), parseCardCode('2c')],
    checkAvailable: false,
  };

  assert.equal(shouldFoldHand({ ...baseDecision, boardState: 'postflop' }).reason, 'postflop');
  assert.equal(shouldFoldHand({ ...baseDecision, boardState: 'unknown' }).reason, 'street-unknown');
  assert.equal(shouldFoldHand(baseDecision).reason, 'street-unknown');
});

test('blocks a delayed fold when the board changes after the initial decision', () => {
  const decision = shouldFoldHand({
    enabled: true,
    rangeSet: { AA: true },
    cards: [parseCardCode('7h'), parseCardCode('2c')],
    checkAvailable: false,
    boardState: 'preflop',
  });

  assert.equal(decision.fold, true);
  assert.equal(canExecuteFold('postflop'), false);
  assert.equal(canExecuteFold('unknown'), false);
});

test('fold click cooldown prevents rapid duplicates but allows later hands', () => {
  const cooldownMs = 1500;
  assert.equal(
    isFoldClickCoolingDown({ lastFoldClickAt: 1000, now: 1200, cooldownMs }),
    true
  );
  assert.equal(
    isFoldClickCoolingDown({ lastFoldClickAt: 1000, now: 2500, cooldownMs }),
    false
  );
  assert.equal(
    isFoldClickCoolingDown({ lastFoldClickAt: 0, now: 100, cooldownMs }),
    false
  );
});

test('recognizes PokerNow return-from-away button text', () => {
  assert.equal(isImBackButtonText("I'm Back"), true);
  assert.equal(isImBackButtonText('I\u2019m Back'), true);
  assert.equal(isImBackButtonText("  I  '  m   Back  "), true);
  assert.equal(isImBackButtonText('Sit Out'), false);
  assert.equal(isImBackButtonText('Welcome back'), false);
});

test('clicks only actionable return buttons outside the cooldown', () => {
  const candidate = {
    text: "I'm Back",
    actionable: true,
    lastClickAt: 0,
    now: 1000,
    cooldownMs: 2000,
  };

  assert.equal(shouldClickImBackButton(candidate), true);
  assert.equal(shouldClickImBackButton({ ...candidate, actionable: false }), false);
  assert.equal(shouldClickImBackButton({ ...candidate, text: 'Fold' }), false);
  assert.equal(shouldClickImBackButton({ ...candidate, lastClickAt: 500, now: 1000 }), false);
  assert.equal(shouldClickImBackButton({ ...candidate, lastClickAt: 500, now: 2500 }), true);
});

test('bypass applies only to the matching current hand', () => {
  assert.equal(isHandBypassed('2c|7h', '2c|7h'), true);
  assert.equal(isHandBypassed('As|Kh', '2c|7h'), false);
  assert.equal(isHandBypassed(null, '2c|7h'), false);
});

test('continuous DOM mutations cannot postpone a scheduled fold attempt', () => {
  assert.equal(shouldScheduleAttempt(null), true);
  assert.equal(shouldScheduleAttempt(42), false);
});

test('playable-hand sound fires once per selected preflop hand', () => {
  const alert = {
    soundEnabled: true,
    rangeSet: { AKs: true },
    handKey: 'AKs',
    activeHandKey: 'As|Ks',
    alertedHandKey: null,
    boardState: 'preflop',
  };

  assert.equal(shouldPlayHandAlert(alert), true);
  assert.equal(shouldPlayHandAlert({ ...alert, alertedHandKey: 'As|Ks' }), false);
  assert.equal(shouldPlayHandAlert({ ...alert, handKey: 'AKo' }), false);
  assert.equal(shouldPlayHandAlert({ ...alert, boardState: 'postflop' }), false);
  assert.equal(shouldPlayHandAlert({ ...alert, soundEnabled: false }), false);
});
