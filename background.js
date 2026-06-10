const SETTINGS_VERSION = 4;
const OFFSCREEN_DOCUMENT = 'offscreen.html';
let creatingOffscreenDocument = null;

async function hasOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT);
  if ('getContexts' in chrome.runtime) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [offscreenUrl],
    });
    return contexts.length > 0;
  }

  const matchedClients = await clients.matchAll();
  return matchedClients.some((client) => client.url === offscreenUrl);
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  if (creatingOffscreenDocument) {
    await creatingOffscreenDocument;
    return;
  }

  creatingOffscreenDocument = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT,
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Play the user-enabled alert for a selected starting hand.',
  });

  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = null;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(
    {
      rangeMode: 'single',
      rangeSet: {},
      positionRanges: {},
      soundEnabled: true,
      settingsVersion: 0,
    },
    (items) => {
      if (items.settingsVersion >= SETTINGS_VERSION) return;

      chrome.storage.sync.set({
        rangeMode: items.rangeMode === 'position' ? 'position' : 'single',
        rangeSet: items.rangeSet || {},
        positionRanges: items.positionRanges || {},
        soundEnabled: items.soundEnabled !== false,
        settingsVersion: SETTINGS_VERSION,
      });
    }
  );
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.target !== 'background' || message?.type !== 'PLAY_HAND_ALERT') return false;

  ensureOffscreenDocument()
    .then(() => chrome.runtime.sendMessage({ type: 'PLAY_HAND_ALERT', target: 'offscreen' }))
    .catch((error) => console.warn('PokerNow Assistant: unable to play alert', error));
  return false;
});
