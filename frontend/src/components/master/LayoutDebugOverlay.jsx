import { useState, useEffect, useCallback } from 'react';

/**
 * DEV-ONLY v2: инструментальный overlay для диагностики iOS mobile web layout.
 * Не рендерится в production (import.meta.env.DEV guard).
 */

const OUTLINE_STYLES = {
  html:   { outline: '2px dashed red',     outlineOffset: '-2px' },
  body:   { outline: '2px dashed orange',  outlineOffset: '-2px' },
  main:   { outline: '2px solid blue',     outlineOffset: '-2px' },
  nav:    { outline: '2px solid magenta',  outlineOffset: '-2px' },
  header: { outline: '2px solid cyan',     outlineOffset: '-2px' },
  stats:  { outline: '2px dotted lime',    outlineOffset: '-2px' },
  shell:  { outline: '2px dashed yellow',  outlineOffset: '-2px' },
};

function hasClippingOverflow(cs) {
  return /hidden|auto|scroll|clip/.test(cs.overflowX);
}

function findClippingAncestor(el, stopAt) {
  let p = el.parentElement;
  while (p && p !== stopAt) {
    if (hasClippingOverflow(getComputedStyle(p))) return p;
    p = p.parentElement;
  }
  return null;
}

function elLabel(el) {
  const parts = [el.tagName.toLowerCase()];
  if (el.id) parts.push('#' + el.id);
  const tid = el.getAttribute('data-testid');
  if (tid) parts.push('[tid=' + tid + ']');
  const role = el.getAttribute('role');
  if (role) parts.push('[role=' + role + ']');
  const aria = el.getAttribute('aria-label');
  if (aria) parts.push('[aria=' + aria.slice(0, 20) + ']');
  return parts.join('');
}

function elText(el) {
  const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
  return t.length > 40 ? t.slice(0, 37) + '...' : t;
}

function measure() {
  const win = {
    innerW: window.innerWidth,
    innerH: window.innerHeight,
  };

  const vv = window.visualViewport;
  const visualVP = vv ? {
    w: Math.round(vv.width),
    h: Math.round(vv.height),
    offTop: Math.round(vv.offsetTop),
    offLeft: Math.round(vv.offsetLeft),
    scale: Math.round(vv.scale * 100) / 100,
  } : null;

  const html = document.documentElement;
  const doc = {
    clientW: html.clientWidth,
    scrollW: html.scrollWidth,
    scrollL: Math.round(html.scrollLeft),
    overflowX: html.scrollWidth > html.clientWidth,
  };

  const body = document.body;
  const bodyM = {
    clientW: body.clientWidth,
    scrollW: body.scrollWidth,
    overflowX: body.scrollWidth > body.clientWidth,
    computedOverflowX: getComputedStyle(body).overflowX,
  };

  const htmlStyle = getComputedStyle(html);

  const mainEl = document.querySelector('main');
  let mainM = null;
  if (mainEl) {
    const r = mainEl.getBoundingClientRect();
    const cs = getComputedStyle(mainEl);
    mainM = {
      x: Math.round(r.x),
      w: Math.round(r.width),
      right: Math.round(r.right),
      contentW: Math.round(r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)),
      scrollW: mainEl.scrollWidth,
      overflowX: mainEl.scrollWidth > mainEl.clientWidth,
      pl: cs.paddingLeft,
      pr: cs.paddingRight,
      pb: cs.paddingBottom,
      cssOverflowX: cs.overflowX,
    };
  }

  const navEl = document.querySelector('nav[aria-label]');
  let navM = null;
  if (navEl) {
    const r = navEl.getBoundingClientRect();
    const cs = getComputedStyle(navEl);
    navM = {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      bottom: Math.round(r.bottom),
      distFromViewportBottom: Math.round(window.innerHeight - r.bottom),
      pb: cs.paddingBottom,
      cssBottom: cs.bottom,
      position: cs.position,
    };
    if (vv) {
      navM.distFromVisualBottom = Math.round(vv.height + vv.offsetTop - r.bottom);
    }
  }

  const headerEl = document.querySelector('header');
  let headerM = null;
  if (headerEl) {
    const r = headerEl.getBoundingClientRect();
    headerM = { w: Math.round(r.width), right: Math.round(r.right) };
  }

  const statsEl = document.querySelector('[data-testid="master-stats-web"]');
  let statsM = null;
  if (statsEl) {
    const r = statsEl.getBoundingClientRect();
    statsM = {
      w: Math.round(r.width),
      right: Math.round(r.right),
      overflowX: statsEl.scrollWidth > statsEl.clientWidth,
    };
  }

  const shellEl = document.querySelector('main')?.parentElement;
  let shellM = null;
  if (shellEl) {
    const r = shellEl.getBoundingClientRect();
    const cs = getComputedStyle(shellEl);
    shellM = {
      w: Math.round(r.width),
      right: Math.round(r.right),
      display: cs.display,
      overflowX: shellEl.scrollWidth > shellEl.clientWidth,
    };
  }

  const overflowChildren = [];
  if (mainEl) {
    const mainRight = mainEl.getBoundingClientRect().right;
    for (const child of mainEl.querySelectorAll('*')) {
      const cr = child.getBoundingClientRect();
      if (cr.width < 2) continue;
      if (cr.right > mainRight + 1) {
        const clipper = findClippingAncestor(child, mainEl);
        let clipped = false;
        let clipperRight = null;
        if (clipper) {
          const cR = clipper.getBoundingClientRect();
          clipperRight = Math.round(cR.right);
          clipped = cR.right < cr.right;
        }
        overflowChildren.push({
          label: elLabel(child),
          cls: (child.className || '').toString().slice(0, 80),
          text: elText(child),
          right: Math.round(cr.right),
          w: Math.round(cr.width),
          left: Math.round(cr.left),
          clipped,
          clipperRight,
          clipperTag: clipper ? elLabel(clipper) : null,
          pastViewport: cr.right > win.innerW,
        });
        if (overflowChildren.length >= 8) break;
      }
    }
  }

  return {
    win, visualVP, doc, body: bodyM,
    htmlOverflowX: htmlStyle.overflowX,
    main: mainM, nav: navM, header: headerM,
    stats: statsM, shell: shellM,
    overflowChildren, ts: Date.now(),
  };
}

function applyOutlines(on) {
  const targets = [
    ['html',   document.documentElement],
    ['body',   document.body],
    ['main',   document.querySelector('main')],
    ['nav',    document.querySelector('nav[aria-label]')],
    ['header', document.querySelector('header')],
    ['stats',  document.querySelector('[data-testid="master-stats-web"]')],
    ['shell',  document.querySelector('main')?.parentElement],
  ];
  targets.forEach(([key, el]) => {
    if (!el) return;
    if (on) {
      const s = OUTLINE_STYLES[key];
      el.style.outline = s.outline;
      el.style.outlineOffset = s.outlineOffset;
    } else {
      el.style.outline = '';
      el.style.outlineOffset = '';
    }
  });
}

function Badge({ data, showOutlines, onToggleOutlines, onRefresh, collapsed, onToggleCollapse }) {
  if (!data) return null;

  const anyOverflow = data.doc.overflowX || data.body.overflowX || data.main?.overflowX;
  const hasUnclippedChildren = data.overflowChildren.some((c) => !c.clipped);

  if (collapsed) {
    return (
      <div
        onClick={onToggleCollapse}
        style={{
          position: 'fixed', top: 4, left: 4, zIndex: 99999,
          background: anyOverflow || hasUnclippedChildren ? '#dc2626' : '#16a34a',
          color: '#fff', fontSize: 9, fontFamily: 'monospace',
          padding: '2px 6px', borderRadius: 4, opacity: 0.9,
          cursor: 'pointer', lineHeight: 1.3,
        }}
      >
        DBG {anyOverflow ? '⚠OVF' : hasUnclippedChildren ? '⚠BLEED' : 'OK'} ▶
      </div>
    );
  }

  const L = (label, val, warn) => (
    <div key={label} style={{ color: warn ? '#fca5a5' : '#e5e7eb' }}>
      <span style={{ color: '#9ca3af' }}>{label}:</span> {val}
    </div>
  );

  return (
    <div
      style={{
        position: 'fixed', top: 4, left: 4, zIndex: 99999,
        background: 'rgba(0,0,0,0.92)', color: '#e5e7eb',
        fontSize: 9, fontFamily: 'monospace', lineHeight: 1.35,
        padding: '4px 6px', borderRadius: 6,
        maxWidth: '80vw', maxHeight: '70vh', overflowY: 'auto',
        WebkitOverflowScrolling: 'touch', pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
        <span onClick={onToggleCollapse} style={{ cursor: 'pointer' }}>◀hide</span>
        <span onClick={onRefresh} style={{ cursor: 'pointer' }}>↻</span>
        <span onClick={onToggleOutlines} style={{ cursor: 'pointer' }}>
          {showOutlines ? '▪outl off' : '▫outl on'}
        </span>
      </div>

      <div style={{ borderBottom: '1px solid #444', paddingBottom: 2, marginBottom: 2, fontWeight: 700 }}>
        {anyOverflow ? '⚠ DOC OVERFLOW' : hasUnclippedChildren ? '⚠ UNCLIPPED BLEED' : '✓ No overflow'}
      </div>

      {L('vw×vh', `${data.win.innerW}×${data.win.innerH}`)}
      {data.visualVP && L('visualVP', `${data.visualVP.w}×${data.visualVP.h} off=${data.visualVP.offTop},${data.visualVP.offLeft} s=${data.visualVP.scale}`)}
      {L('doc cW/sW', `${data.doc.clientW}/${data.doc.scrollW}`, data.doc.overflowX)}
      {L('doc scrollL', data.doc.scrollL, data.doc.scrollL !== 0)}
      {L('html ovf-x', data.htmlOverflowX)}
      {L('body sW/ovfX', `${data.body.scrollW}/${data.body.overflowX}`, data.body.overflowX)}

      {data.main && (
        <>
          <div style={{ borderTop: '1px solid #555', marginTop: 2, paddingTop: 2, color: '#60a5fa', fontWeight: 600 }}>main (blue)</div>
          {L('rect', `x=${data.main.x} w=${data.main.w} r=${data.main.right}`)}
          {L('contentW', data.main.contentW)}
          {L('scrollW/ovf', `${data.main.scrollW}/${data.main.overflowX}`, data.main.overflowX)}
          {L('css ovf-x', data.main.cssOverflowX)}
          {L('pl/pr', `${data.main.pl}/${data.main.pr}`)}
          {L('pb', data.main.pb)}
        </>
      )}

      {data.nav && (
        <>
          <div style={{ borderTop: '1px solid #555', marginTop: 2, paddingTop: 2, color: '#e879f9', fontWeight: 600 }}>nav (magenta)</div>
          {L('pos', data.nav.position)}
          {L('css bottom', data.nav.cssBottom)}
          {L('rect', `y=${data.nav.y} w=${data.nav.w} h=${data.nav.h}`)}
          {L('rect.bottom', data.nav.bottom)}
          {L('dist→innerH', data.nav.distFromViewportBottom, Math.abs(data.nav.distFromViewportBottom) > 2)}
          {data.nav.distFromVisualBottom != null && L('dist→visualVP', data.nav.distFromVisualBottom, Math.abs(data.nav.distFromVisualBottom) > 2)}
          {L('pb(safe)', data.nav.pb)}
        </>
      )}

      {data.header && (
        <>
          <div style={{ borderTop: '1px solid #555', marginTop: 2, paddingTop: 2, color: '#22d3ee', fontWeight: 600 }}>header (cyan)</div>
          {L('w/right', `${data.header.w}/${data.header.right}`, data.header.right > data.win.innerW)}
        </>
      )}

      {data.stats && (
        <>
          <div style={{ borderTop: '1px solid #555', marginTop: 2, paddingTop: 2, color: '#4ade80', fontWeight: 600 }}>stats (lime)</div>
          {L('w/right/ovf', `${data.stats.w}/${data.stats.right}/${data.stats.overflowX}`, data.stats.right > data.win.innerW)}
        </>
      )}

      {data.shell && (
        <>
          <div style={{ borderTop: '1px solid #555', marginTop: 2, paddingTop: 2, color: '#facc15', fontWeight: 600 }}>shell (yellow)</div>
          {L('w/right/ovf', `${data.shell.w}/${data.shell.right}/${data.shell.overflowX}`, data.shell.right > data.win.innerW)}
        </>
      )}

      {data.overflowChildren.length > 0 && (
        <>
          <div style={{ borderTop: '1px solid #f87171', marginTop: 3, paddingTop: 2, color: '#f87171', fontWeight: 700 }}>
            ⚠ Past main right edge ({data.overflowChildren.length}):
          </div>
          {data.overflowChildren.map((c, i) => (
            <div key={i} style={{
              marginTop: 2, paddingTop: 2, borderTop: '1px dotted #555',
              color: c.clipped ? '#9ca3af' : '#fca5a5',
              wordBreak: 'break-all',
            }}>
              <div style={{ fontWeight: 600 }}>
                {c.clipped ? '✂' : '⚠'} {c.label}
              </div>
              <div>L={c.left} R={c.right} W={c.w} {c.pastViewport ? '→PAST VP' : ''}</div>
              {c.clipped && c.clipperTag && (
                <div style={{ color: '#6b7280' }}>clipped by {c.clipperTag} (r={c.clipperRight})</div>
              )}
              {!c.clipped && <div style={{ color: '#f87171', fontWeight: 700 }}>⚠ UNCLIPPED — visually bleeds</div>}
              <div style={{ fontSize: 8, color: '#6b7280' }}>cls: {c.cls}</div>
              {c.text && <div style={{ fontSize: 8, color: '#78716c' }}>txt: {c.text}</div>}
            </div>
          ))}
        </>
      )}

      <div style={{ borderTop: '1px solid #555', marginTop: 2, paddingTop: 2, color: '#6b7280', fontSize: 8 }}>
        main.pb={data.main?.pb || '?'} nav.h={data.nav?.h || '?'}px
      </div>
    </div>
  );
}


function LayoutDebugOverlayInner() {
  const [data, setData] = useState(null);
  const [outlines, setOutlines] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const refresh = useCallback(() => setData(measure()), []);

  useEffect(() => {
    const t = setTimeout(refresh, 500);
    return () => clearTimeout(t);
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    applyOutlines(outlines);
    return () => applyOutlines(false);
  }, [outlines, data]);

  return (
    <Badge
      data={data}
      showOutlines={outlines}
      onToggleOutlines={() => setOutlines((v) => !v)}
      onRefresh={refresh}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((v) => !v)}
    />
  );
}

export default function LayoutDebugOverlay() {
  if (!import.meta.env.DEV) return null;
  if (typeof window !== 'undefined' && window.innerWidth >= 1024) return null;
  return <LayoutDebugOverlayInner />;
}
