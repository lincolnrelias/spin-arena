import { clamp } from './utils.js';

export const CONFIG_VERSION = 1;

export const DEFAULT_CONFIG = {
  version: CONFIG_VERSION,
  steering: {
    enabled: true,
    mult: 1,
    seekMult: 1,
    edgeMult: 1,
    centerMult: 1,
    stallMult: 1,

    seekAccelMin: 28,
    seekAccelMax: 90,
    seekNearDist: 140,
    seekFarDist: 560,

    edgeStartRatio: 0.78,
    edgeInwardAccel: 120,
    edgeOrbitRadialThreshold: 10,
    edgeOrbitBreakAccel: 25,

    centerRadius: 42,
    centerDriftAccel: 55,

    stallSpeedThreshold: 18,
    stallTime: 0.65,
    stallTapAccel: 170
  }
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

  // sanitização mínima
  const s = out.steering;
  s.enabled = !!s.enabled;
  s.mult = clamp(Number(s.mult) || 0, 0, 10);
  s.seekMult = clamp(Number(s.seekMult) || 0, 0, 10);
  s.edgeMult = clamp(Number(s.edgeMult) || 0, 0, 10);
  s.centerMult = clamp(Number(s.centerMult) || 0, 0, 10);
  s.stallMult = clamp(Number(s.stallMult) || 0, 0, 10);

  s.seekAccelMin = clamp(Number(s.seekAccelMin) || 0, 0, 1000);
  s.seekAccelMax = clamp(Number(s.seekAccelMax) || 0, 0, 1000);
  s.seekNearDist = clamp(Number(s.seekNearDist) || 0, 0, 5000);
  s.seekFarDist = clamp(Number(s.seekFarDist) || 1, 1, 5000);

  s.edgeStartRatio = clamp(Number(s.edgeStartRatio) || 0, 0, 0.999);
  s.edgeInwardAccel = clamp(Number(s.edgeInwardAccel) || 0, 0, 2000);
  s.edgeOrbitRadialThreshold = clamp(Number(s.edgeOrbitRadialThreshold) || 0, 0, 200);
  s.edgeOrbitBreakAccel = clamp(Number(s.edgeOrbitBreakAccel) || 0, 0, 2000);

  s.centerRadius = clamp(Number(s.centerRadius) || 0, 0, 500);
  s.centerDriftAccel = clamp(Number(s.centerDriftAccel) || 0, 0, 2000);

  s.stallSpeedThreshold = clamp(Number(s.stallSpeedThreshold) || 0, 0, 500);
  s.stallTime = clamp(Number(s.stallTime) || 0, 0, 10);
  s.stallTapAccel = clamp(Number(s.stallTapAccel) || 0, 0, 5000);

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
  rangeEl.addEventListener('input', () => onChange(Number(rangeEl.value)));
  numberEl.addEventListener('input', () => onChange(Number(numberEl.value)));
  return { sync };
}

export function mountSettingsUI(initialCfg, onConfigChange) {
  const root = document.getElementById('settings');
  const toggleBtn = document.getElementById('settingsToggle');

  const enabledEl = document.getElementById('cfg_steer_enabled');

  const multR = document.getElementById('cfg_steer_mult');
  const multN = document.getElementById('cfg_steer_mult_n');
  const seekR = document.getElementById('cfg_steer_seek');
  const seekN = document.getElementById('cfg_steer_seek_n');
  const edgeR = document.getElementById('cfg_steer_edge');
  const edgeN = document.getElementById('cfg_steer_edge_n');
  const centerR = document.getElementById('cfg_steer_center');
  const centerN = document.getElementById('cfg_steer_center_n');
  const stallR = document.getElementById('cfg_steer_stall');
  const stallN = document.getElementById('cfg_steer_stall_n');

  const saveBtn = document.getElementById('cfg_save');
  const resetBtn = document.getElementById('cfg_reset');
  const importEl = document.getElementById('cfg_import');

  let cfg = normalizeConfig(initialCfg);

  const apply = () => {
    cfg = normalizeConfig(cfg);
    saveConfigToLocalStorage(cfg);
    onConfigChange(cfg);
  };

  const setOpen = (open) => {
    root.classList.toggle('open', open);
    toggleBtn.textContent = open ? 'Fechar' : 'Abrir';
  };

  toggleBtn.addEventListener('click', () => setOpen(!root.classList.contains('open')));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'g' || e.key === 'G') setOpen(!root.classList.contains('open'));
  });

  enabledEl.addEventListener('change', () => {
    cfg.steering.enabled = !!enabledEl.checked;
    apply();
  });

  const multPair = bindRangePair(multR, multN, (v) => { cfg.steering.mult = v; apply(); });
  const seekPair = bindRangePair(seekR, seekN, (v) => { cfg.steering.seekMult = v; apply(); });
  const edgePair = bindRangePair(edgeR, edgeN, (v) => { cfg.steering.edgeMult = v; apply(); });
  const centerPair = bindRangePair(centerR, centerN, (v) => { cfg.steering.centerMult = v; apply(); });
  const stallPair = bindRangePair(stallR, stallN, (v) => { cfg.steering.stallMult = v; apply(); });

  const syncAll = () => {
    enabledEl.checked = !!cfg.steering.enabled;
    multPair.sync(cfg.steering.mult);
    seekPair.sync(cfg.steering.seekMult);
    edgePair.sync(cfg.steering.edgeMult);
    centerPair.sync(cfg.steering.centerMult);
    stallPair.sync(cfg.steering.stallMult);
  };

  saveBtn.addEventListener('click', () => {
    cfg = normalizeConfig(cfg);
    downloadConfigJson(cfg, 'config.json');
  });

  resetBtn.addEventListener('click', () => {
    cfg = structuredClone(DEFAULT_CONFIG);
    syncAll();
    apply();
  });

  importEl.addEventListener('change', async () => {
    const f = importEl.files?.[0];
    if (!f) return;
    const txt = await f.text();
    cfg = normalizeConfig(JSON.parse(txt));
    syncAll();
    apply();
    importEl.value = '';
  });

  syncAll();
  apply();

  return {
    getConfig: () => cfg,
    setConfig: (nextCfg) => {
      cfg = normalizeConfig(nextCfg);
      syncAll();
      apply();
    }
  };
}

