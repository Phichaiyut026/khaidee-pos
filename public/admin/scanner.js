// Barcode / QR scanner support (USB or Bluetooth scanners in keyboard/HID mode).
//
// A scanner "types" the code much faster than a person and usually ends with Enter or Tab.
// We watch every keydown, and when a burst of keys arrives fast enough we treat it as a scan:
//  - the code works without clicking a search box first;
//  - characters are rebuilt from the physical key (e.code), so scans still read correctly
//    while the keyboard is set to Thai (otherwise "8850..." would come out as Thai letters);
//  - anything the burst typed into a focused input is rolled back before handlers run.
(function () {
  const MAX_GAP_MS = 50; // max time between keys from a scanner
  const MIN_LEN = 4; // shortest code accepted when the scanner sends Enter/Tab
  const IDLE_MIN_LEN = 6; // shortest code accepted for scanners that send no suffix
  const IDLE_MS = 100; // finish a suffix-less scan after this much silence

  const SHIFTED_DIGITS = ')!@#$%^&*(';
  const PUNCT = {
    Minus: ['-', '_'], Equal: ['=', '+'], BracketLeft: ['[', '{'], BracketRight: [']', '}'],
    Backslash: ['\\', '|'], Semicolon: [';', ':'], Quote: ["'", '"'], Comma: [',', '<'],
    Period: ['.', '>'], Slash: ['/', '?'], Backquote: ['`', '~'], Space: [' ', ' '],
    NumpadDecimal: ['.', '.'], NumpadAdd: ['+', '+'], NumpadSubtract: ['-', '-'],
    NumpadMultiply: ['*', '*'], NumpadDivide: ['/', '/'],
  };

  // Always read the physical key (US layout). Checking e.key first is not enough: on the Thai
  // Kedmanee layout some keys still produce ASCII (Digit2 → "/", Digit3 → "-", Shift+Quote → ".").
  function charFor(e) {
    let m = /^Key([A-Z])$/.exec(e.code || '');
    if (m) {
      const upper = e.shiftKey !== Boolean(e.getModifierState && e.getModifierState('CapsLock'));
      return upper ? m[1] : m[1].toLowerCase();
    }
    if ((m = /^Digit(\d)$/.exec(e.code))) return e.shiftKey ? SHIFTED_DIGITS[m[1]] : m[1];
    if ((m = /^Numpad(\d)$/.exec(e.code))) return m[1];
    if (PUNCT[e.code]) return PUNCT[e.code][e.shiftKey ? 1 : 0];
    return e.key.length === 1 ? e.key : null; // device sent no key code: trust the character
  }

  const listeners = [];
  let buf = [];
  let target = null;
  let startValue = null;
  let timer = null;

  function reset() {
    buf = [];
    target = null;
    startValue = null;
    clearTimeout(timer);
  }

  const isFast = () => buf.every((k, i) => i === 0 || k.t - buf[i - 1].t <= MAX_GAP_MS);

  function finish() {
    const code = buf.map((k) => k.ch).join('').trim();
    const el = target;
    const before = startValue;
    reset();
    if (el && before !== null && el.value !== before) {
      el.value = before; // undo the characters the scanner typed into the field
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    for (const fn of listeners) fn(code, { target: el, before });
  }

  document.addEventListener('keydown', (e) => {
    if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return reset();
    const now = performance.now();
    const last = buf[buf.length - 1];

    if (e.key === 'Enter' || e.key === 'Tab') {
      if (buf.length >= MIN_LEN && now - last.t <= MAX_GAP_MS * 3 && isFast()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        finish();
      } else reset();
      return;
    }

    const ch = charFor(e);
    if (ch === null) return; // Shift, CapsLock, arrows... don't break a burst
    if (last && now - last.t > MAX_GAP_MS) reset(); // too slow: a person typing, start over
    if (!buf.length) {
      target = document.activeElement;
      startValue = target && typeof target.value === 'string' ? target.value : null;
    }
    buf.push({ ch, t: now });
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (buf.length >= IDLE_MIN_LEN && isFast()) finish();
      else reset();
    }, IDLE_MS);
  }, true);

  // Pull the product code out of common QR payloads:
  // plain text, "SKU:ABC", JSON {"sku": ...}, or a URL like https://x/p/ABC?sku=ABC
  function candidates(raw) {
    const out = new Set();
    const add = (v) => { if (v != null && String(v).trim()) out.add(String(v).trim()); };
    add(raw);
    const m = /^(?:sku|barcode|code|id)\s*[:=]\s*(.+)$/i.exec(raw);
    if (m) add(m[1]);
    try {
      const j = JSON.parse(raw);
      if (j && typeof j === 'object') ['sku', 'barcode', 'code', 'id'].forEach((k) => add(j[k]));
    } catch { /* not JSON */ }
    try {
      const u = new URL(raw);
      ['sku', 'barcode', 'code', 'id', 'p'].forEach((k) => add(u.searchParams.get(k)));
      const seg = u.pathname.split('/').filter(Boolean).pop();
      if (seg) add(decodeURIComponent(seg));
    } catch { /* not a URL */ }
    return [...out];
  }

  let audio;
  function beep(ok = true) {
    window.dispatchEvent(new CustomEvent('scanner:result', { detail: { ok } }));
    if (window.frameElement?.dataset.pda) return; // inside the PDA simulator: the device makes the sound
    try {
      audio = audio || new AudioContext();
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = ok ? 1400 : 280;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + (ok ? 0.08 : 0.3));
    } catch { /* audio unavailable */ }
  }

  window.Scanner = {
    onScan: (fn) => listeners.push(fn),
    /** Find the product whose barcode or SKU matches the scanned payload. */
    match(raw, products) {
      for (const c of candidates(raw)) {
        const lc = c.toLowerCase();
        const hit = products.find((p) => (p.barcode && p.barcode === c) || p.sku.toLowerCase() === lc);
        if (hit) return hit;
      }
      return null;
    },
    beep,
  };
})();
