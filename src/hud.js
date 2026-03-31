import { clamp } from './utils.js';
import { fmt } from './numbers.js';

function hpColor(t) {
  // t: 1=cheio, 0=quase morto
  if (t > 0.5) return `hsl(${120 * (t - 0.5) * 2}, 80%, 55%)`;
  return `hsl(${120 * t * 2}, 80%, 55%)`;
}

export function createHud() {
  const elA = {
    avatar: document.getElementById('avatarA'),
    name: document.getElementById('nameA'),
    hpBar: document.getElementById('hpBarA'),
    hpFill: document.getElementById('hpFillA'),
    hpText: document.getElementById('hpTextA')
  };
  const elB = {
    avatar: document.getElementById('avatarB'),
    name: document.getElementById('nameB'),
    hpBar: document.getElementById('hpBarB'),
    hpFill: document.getElementById('hpFillB'),
    hpText: document.getElementById('hpTextB')
  };
  const centerTopEl = document.getElementById('centerTop');
  const logEl = document.getElementById('log');

  let lastNumericUpdate = 0;
  let lastA = { spin: NaN };
  let lastB = { spin: NaN };

  function setTopUI(el, top) {
    el.name.textContent = top ? top.displayName : '-';
    el.avatar.textContent = top ? top.avatarChar : '?';

    if (!top) {
      el.hpFill.style.width = '0%';
      el.hpFill.style.background = '#0f0';
      el.hpText.textContent = '0 / 0';
      return;
    }

    const hpMax = top.hpMax;
    const hp = top.hp;
    const t = hpMax > 0 ? clamp(hp / hpMax, 0, 1) : 0;
    el.hpFill.style.width = `${Math.round(t * 100)}%`;
    el.hpFill.style.background = hpColor(t);
    el.hpText.textContent = `${fmt(hp)} / ${fmt(hpMax)}`;
  }

  function update(topA, topB, nowMs) {
    // Atualiza barrinhas a cada tick (bar visual é barata)
    setTopUI(elA, topA);
    setTopUI(elB, topB);

    // Throttle leve para texto central e log (evita DOM churn demais)
    if (nowMs - lastNumericUpdate > 33) {
      lastNumericUpdate = nowMs;
      if (topA && topB) centerTopEl.textContent = 'FIGHT';
      else centerTopEl.textContent = '';
      lastA.spin = topA ? topA.spin : NaN;
      lastB.spin = topB ? topB.spin : NaN;
    }
  }

  function setEventLog(text) {
    if (!text) {
      logEl.textContent = '';
      return;
    }
    logEl.textContent = text;
    logEl.style.opacity = '1';
    clearTimeout(setEventLog._t);
    setEventLog._t = setTimeout(() => {
      logEl.style.opacity = '0';
    }, 2000);
  }

  return { update, setEventLog };
}

