# PokerNow Assistant

A Chrome extension that folds two-card Hold'em hands outside configurable single or position-aware keep ranges on PokerNow.

## Safety behavior

- Disabled by default on first install; upgrades preserve the existing setting.
- An empty keep range never folds anything.
- Position mode fails closed if PokerNow's dealer, seat order, or table participant count cannot be confirmed.
- Reads cards only from PokerNow's current-player container.
- Requires exactly two visible hole cards, so Omaha variants are ignored.
- Never folds when a free Check action is available.
- Never folds after community cards appear or when the street cannot be confirmed.
- Gives each fold a five-second grace period for the **Bypass this hand** button, which immediately turns the assistant off and cancels the pending fold.
- Automatically clicks PokerNow's **I'm Back** button whenever the user is marked away, even when the assistant is disabled.
- Plays an optional two-note alert once when a selected preflop hand is dealt.
- Clicks a rendered Fold button at most once.

## Install

1. Open `chrome://extensions` in Chrome or another Chromium browser.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. After editing the extension, click its **Reload** button on `chrome://extensions`.
5. Refresh every open PokerNow table after reloading the extension. Chrome cannot update an already-injected content script in place.

## Use

1. Open the extension popup.
2. Choose **Single range** to use one grid everywhere, or **Position + player count** for context-specific grids.
3. In position mode, choose a player count and position, then select every starting hand you want to keep. Use **Copy single range** as a starting point for a profile. Blue cells are kept.
4. Repeat for every player-count and position combination you expect to use. An unconfigured profile is empty and will never auto-fold.
5. Turn on **Enabled**.
6. Join a two-card Hold'em table on `pokernow.com` or `pokernow.club`.
7. Check the popup status while testing. It shows the detected position and number of table participants. Start with a play-money test table and conservative ranges.

Before the flop, hands outside the selected range are folded when PokerNow shows an enabled Fold action and does not show an enabled Check action. In position mode, the extension uses the total detected table participants for the range page; folded players do not change the player-count profile. The assistant is inactive on every later street.

The range editor shows the selected-hand count and percentage of all 169 Hold'em starting hands. The collapsed **Diagnostics** panel at the bottom of the popup shows the latest position-scan details, including hero/dealer node counts, participant seats, resolved position, and whether a short-lived cached table context is being used.

## Development

Run the pure decision-logic tests with:

```sh
npm test
```

PokerNow can change its markup. The selectors in `content.js` currently match the site's `.table-player.you-player`, `.table-player-cards`, `.dealer-button-ctn`, `.table-cards`, and `.game-decisions-ctn` structures.
