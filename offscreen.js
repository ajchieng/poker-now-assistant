let audioContext = null;

function playTone(context, frequency, startsAt, duration) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startsAt);
  gain.gain.exponentialRampToValueAtTime(0.18, startsAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startsAt);
  oscillator.stop(startsAt + duration);
}

async function playHandAlert() {
  audioContext ||= new AudioContext();
  if (audioContext.state === 'suspended') await audioContext.resume();
  const startsAt = audioContext.currentTime + 0.02;
  playTone(audioContext, 659.25, startsAt, 0.14);
  playTone(audioContext, 880, startsAt + 0.16, 0.2);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.target !== 'offscreen' || message?.type !== 'PLAY_HAND_ALERT') return false;
  playHandAlert().catch((error) => console.warn('PokerNow Assistant: audio failed', error));
  return false;
});
