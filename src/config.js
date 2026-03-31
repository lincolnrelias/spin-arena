export const CONFIG_VERSION = 1;

export const DEFAULT_CONFIG = {
  version: CONFIG_VERSION,
  spinVisualMult: 3,
  showHpRing: true
};

function deepMerge(dst, src) {
  if (!src || typeof src !== 'object') return dst;
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (!dst[k] || typeof dst[k] !== 'object') dst[k] = {};
      deepMerge(dst[k], v);
    } else {
      dst[k] = v;
    }
  }
  return dst;
}

export function normalizeConfig(cfg) {
  const out = structuredClone(DEFAULT_CONFIG);
  deepMerge(out, cfg);
  out.version = CONFIG_VERSION;
  out.spinVisualMult = Math.max(0.1, Math.min(10, Number(out.spinVisualMult ?? DEFAULT_CONFIG.spinVisualMult) || DEFAULT_CONFIG.spinVisualMult));
  out.showHpRing = out.showHpRing !== false;
  // Remove qualquer resíduo do antigo sistema de “steering”.
  delete out.steering;

  return out;
}

export async function loadConfigFirst() {
  // Prioridade:
  // 1) localStorage (último estado da UI)
  // 2) /config.json (arquivo do projeto)
  // 3) defaults
  try {
    const raw = localStorage.getItem('STR_config_v1');
    if (raw) return normalizeConfig(JSON.parse(raw));
  } catch {}

  try {
    const res = await fetch('./config.json', { cache: 'no-store' });
    if (res.ok) return normalizeConfig(await res.json());
  } catch {}

  return structuredClone(DEFAULT_CONFIG);
}

export function saveConfigToLocalStorage(cfg) {
  try {
    localStorage.setItem('STR_config_v1', JSON.stringify(cfg));
  } catch {}
}

export function downloadConfigJson(cfg, filename = 'config.json') {
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bindRangePair(rangeEl, numberEl, onChange) {
  const sync = (v) => {
    rangeEl.value = String(v);
    numberEl.value = String(v);
  };
  const applyRange = () => onChange(Number(rangeEl.value));
  const applyNumber = () => onChange(Number(numberEl.value));
  rangeEl.addEventListener('input', applyRange);
  rangeEl.addEventListener('change', applyRange);
  numberEl.addEventListener('input', applyNumber);
  numberEl.addEventListener('change', applyNumber);
  return { sync };
}

export function mountSettingsUI(initialCfg, onConfigChange) {
  const root = document.getElementById('settings');
  const toggleBtn = document.getElementById('settingsToggle');

  const saveBtn = document.getElementById('cfg_save');
  const resetBtn = document.getElementById('cfg_reset');
  const importEl = document.getElementById('cfg_import');
  const spinVisualMultRange = document.getElementById('cfg_spinVisualMult');
  const spinVisualMultNum = document.getElementById('cfg_spinVisualMult_num');
  const showHpRingEl = document.getElementById('cfg_showHpRing');

  let cfg = normalizeConfig(initialCfg);
  let spinVisualMultSync = null;

  const apply = () => {
    cfg = normalizeConfig(cfg);
    if (spinVisualMultSync) spinVisualMultSync.sync(cfg.spinVisualMult);
    if (showHpRingEl) showHpRingEl.checked = cfg.showHpRing !== false;
    saveConfigToLocalStorage(cfg);
    onConfigChange(cfg);
  };
  spinVisualMultSync = (spinVisualMultRange && spinVisualMultNum)
    ? bindRangePair(spinVisualMultRange, spinVisualMultNum, (v) => {
      cfg.spinVisualMult = v;
      apply();
    })
    : null;
  if (spinVisualMultSync) spinVisualMultSync.sync(cfg.spinVisualMult);
  if (showHpRingEl) {
    showHpRingEl.checked = cfg.showHpRing !== false;
    showHpRingEl.addEventListener('change', () => {
      cfg.showHpRing = !!showHpRingEl.checked;
      apply();
    });
  }

  const setOpen = (open) => {
    root.classList.toggle('open', open);
    toggleBtn.textContent = open ? 'Fechar' : 'Abrir';
  };

  toggleBtn.addEventListener('click', () => setOpen(!root.classList.contains('open')));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'g' || e.key === 'G') setOpen(!root.classList.contains('open'));
  });

  saveBtn.addEventListener('click', () => {
    cfg = normalizeConfig(cfg);
    downloadConfigJson(cfg, 'config.json');
  });

  resetBtn.addEventListener('click', () => {
    cfg = structuredClone(DEFAULT_CONFIG);
    apply();
  });

  importEl.addEventListener('change', async () => {
    const f = importEl.files?.[0];
    if (!f) return;
    const txt = await f.text();
    cfg = normalizeConfig(JSON.parse(txt));
    apply();
    importEl.value = '';
  });

  apply();

  return {
    getConfig: () => cfg,
    setConfig: (nextCfg) => {
      cfg = normalizeConfig(nextCfg);
      apply();
    }
  };
}

