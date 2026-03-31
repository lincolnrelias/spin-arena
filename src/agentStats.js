function maybeNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

function attrsToObject(el) {
  const out = {};
  if (!el) return out;
  for (const a of el.attributes) {
    out[a.name] = maybeNum(a.value);
  }
  return out;
}

export async function loadAgentStats() {
  try {
    const res = await fetch('./agents.xml', { cache: 'no-store' });
    if (!res.ok) throw new Error(`agents.xml ${res.status}`);
    const xmlText = await res.text();
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');

    const parserErr = doc.querySelector('parsererror');
    if (parserErr) throw new Error('XML parse error in agents.xml');

    const commonDefaults = attrsToObject(doc.querySelector('common > defaults'));
    const map = new Map();

    const agents = doc.querySelectorAll('agents > agent');
    for (const agentEl of agents) {
      const base = attrsToObject(agentEl);
      const ability = attrsToObject(agentEl.querySelector('ability'));
      const id = String(base.id ?? '').trim();
      if (!id) continue;
      map.set(id, { ...commonDefaults, ...base, ability });
    }
    return map;
  } catch {
    return new Map();
  }
}

