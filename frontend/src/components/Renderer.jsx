import { useMemo, useRef, useState, useEffect, useLayoutEffect } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import 'katex/contrib/mhchem';
import { getTagColour } from '../tags/tagSchemas.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTagData(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function extractBraceContent(text, start) {
  if (text[start - 1] !== '{') return null;
  let depth = 1, i = start;
  while (i < text.length && depth > 0) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    if (depth > 0) i++;
  }
  return depth === 0 ? text.slice(start, i) : null;
}

function mathInline(latex, key) {
  try {
    return <span key={key} dangerouslySetInnerHTML={{ __html: katex.renderToString(latex, { throwOnError: false }) }} />;
  } catch {
    return <code key={key} style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>{latex}</code>;
  }
}

function mathBlock(latex) {
  try {
    return (
      <div
        style={{ margin: '1em 0', textAlign: 'center', overflowX: 'auto' }}
        dangerouslySetInnerHTML={{ __html: katex.renderToString(latex, { throwOnError: false, displayMode: true }) }}
      />
    );
  } catch {
    return <pre style={{ fontFamily: 'monospace', fontSize: '0.88em', overflowX: 'auto' }}>{latex}</pre>;
  }
}

function parseInline(text) {
  if (!text) return null;
  const parts = [];
  let i = 0, key = 0;

  const CMDS = {
    underline: (c) => <span key={key++} style={{ textDecoration: 'underline' }}>{c}</span>,
    textbf:    (c) => <span key={key++} style={{ fontWeight: 700 }}>{c}</span>,
    textit:    (c) => <span key={key++} style={{ fontStyle: 'italic' }}>{c}</span>,
    emph:      (c) => <span key={key++} style={{ fontStyle: 'italic' }}>{c}</span>,
    sout:      (c) => <span key={key++} style={{ textDecoration: 'line-through' }}>{c}</span>,
    circle:    (c) => <span key={key++} style={{ border: '1px solid currentColor', borderRadius: '50%', padding: '0 4px', whiteSpace: 'nowrap' }}>{c}</span>,
    overline:  (c) => <span key={key++} style={{ textDecoration: 'overline' }}>{c}</span>,
    textsc:    (c) => <span key={key++} style={{ fontVariant: 'small-caps' }}>{c}</span>,
  };

  while (i < text.length) {
    // $...$ inline math
    if (text[i] === '$') {
      const end = text.indexOf('$', i + 1);
      if (end !== -1) { parts.push(mathInline(text.slice(i + 1, end), key++)); i = end + 1; continue; }
    }

    // \command — known formatting first, then KaTeX for everything else
    if (text[i] === '\\') {
      const m = text.slice(i + 1).match(/^([a-zA-Z]+)/);
      if (m) {
        const cmdName = m[1];
        const afterCmd = i + 1 + cmdName.length;

        // Known formatting commands that take one {arg}
        if (text[afterCmd] === '{' && CMDS[cmdName]) {
          const inner = extractBraceContent(text, afterCmd + 1);
          if (inner !== null) {
            parts.push(CMDS[cmdName](parseInline(inner)));
            i = afterCmd + 1 + inner.length + 1;
            continue;
          }
        }

        // All other \commands: collect consecutive {brace} groups and send to KaTeX
        // This handles \frac{1}{2}, \sqrt{x}, \rightarrow, \alpha, \xrightarrow{\text{...}}, etc.
        let mathExpr = `\\${cmdName}`;
        let j = afterCmd;
        while (j < text.length && text[j] === '{') {
          const inner = extractBraceContent(text, j + 1);
          if (inner === null) break;
          mathExpr += `{${inner}}`;
          j = j + 1 + inner.length + 1;
        }
        try {
          parts.push(<span key={key++} dangerouslySetInnerHTML={{ __html: katex.renderToString(mathExpr, { throwOnError: true }) }} />);
          i = j;
        } catch {
          parts.push(<span key={key++} style={{ color: '#aaa', fontFamily: 'monospace', fontSize: '0.85em' }}>{mathExpr}</span>);
          i = j;
        }
        continue;
      }
    }

    // _subscript  e.g. H_2O  Ca(OH)_2  SO_{4}
    if (text[i] === '_') {
      let sub, end;
      if (text[i + 1] === '{') {
        const inner = extractBraceContent(text, i + 2);
        if (inner !== null) { sub = inner; end = i + 2 + inner.length + 1; }
      } else if (text[i + 1] !== undefined && /[a-zA-Z0-9+\-]/.test(text[i + 1])) {
        sub = text[i + 1]; end = i + 2;
      }
      if (sub !== undefined) {
        parts.push(<sub key={key++} style={{ fontSize: '0.78em', lineHeight: 1 }}>{sub}</sub>);
        i = end;
        continue;
      }
    }

    // ^superscript  e.g. Ca^{2+}  Fe^3+  x^2
    if (text[i] === '^') {
      let sup, end;
      if (text[i + 1] === '{') {
        const inner = extractBraceContent(text, i + 2);
        if (inner !== null) { sup = inner; end = i + 2 + inner.length + 1; }
      } else if (text[i + 1] !== undefined && /[a-zA-Z0-9+\-]/.test(text[i + 1])) {
        sup = text[i + 1]; end = i + 2;
      }
      if (sup !== undefined) {
        parts.push(<sup key={key++} style={{ fontSize: '0.78em', lineHeight: 1 }}>{sup}</sup>);
        i = end;
        continue;
      }
    }

    // Plain text — accumulate until the next special character
    let j = i + 1;
    while (j < text.length && text[j] !== '\\' && text[j] !== '$' && text[j] !== '_' && text[j] !== '^') j++;
    parts.push(<span key={key++}>{text.slice(i, j)}</span>);
    i = j;
  }
  return parts;
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const FONT = "Georgia, 'Times New Roman', serif";

const D = {
  body:         { fontFamily: FONT, fontSize: '15px', lineHeight: 1.65, color: '#111' },
  p:            { margin: '0 0 0.5em 0', textAlign: 'justify', hyphens: 'auto' },
  h1:           { fontSize: '1.3em',  fontWeight: 700, margin: '1.5em 0 0.4em', lineHeight: 1.2 },
  h2:           { fontSize: '1.12em', fontWeight: 700, margin: '1.2em 0 0.3em', lineHeight: 1.2 },
  h3:           { fontSize: '1em',    fontWeight: 700, fontStyle: 'italic', margin: '1em 0 0.25em', lineHeight: 1.2 },
  answerBlock:  { margin: '1.4em 0', borderTop: '1.5px solid currentColor', paddingTop: '0.5em' },
  answerLabel:  { fontSize: '0.77em', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.35em' },
  sectionWrap:  { margin: '1em 0' },
  sectionLabel: { fontSize: '0.72em', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.15em' },
  sectionBody:  { borderLeft: '1.5px solid #ccc', paddingLeft: '14px' },
  ol:           { margin: '0.5em 0', paddingLeft: '2em' },
  ul:           { margin: '0.5em 0', paddingLeft: '2em' },
  li:           { margin: '0.1em 0', textAlign: 'justify' },
  table:        { borderCollapse: 'collapse', margin: '1em 0', fontSize: '0.93em', lineHeight: 1.5 },
  td:           { padding: '3px 14px', verticalAlign: 'top' },
};


// ── Tag renderers ─────────────────────────────────────────────────────────────

function C({ text }) { return <>{parseInline(text)}</>; }

function Tag({ box, children }) {
  const td = parseTagData(box.tag_data);
  const content = box.content_text || td.content || td.source_text || '';
  const tag = box.tag_category;

  // ── Text / structure ──────────────────────────────────────────────────────

  if (tag === 'text') return <p style={D.p}><C text={content} /></p>;

  if (tag === 'line') {
    const isCtr = td.indent === 'center';
    return (
      <p style={{ ...D.p, textAlign: isCtr ? 'center' : 'justify', paddingLeft: isCtr ? 0 : `${(Number(td.indent) || 0) * 1.5}em` }}>
        <C text={content} />
      </p>
    );
  }

  if (tag === 'paragraph') {
    const lines = content ? content.split('\n').filter(Boolean) : [];
    return (
      <div style={{ margin: '0.5em 0' }}>
        {lines.map((l, i) => <p key={i} style={D.p}><C text={l} /></p>)}
        {children}
      </div>
    );
  }

  if (tag === 'heading') {
    const s = { '1': D.h1, '2': D.h2, '3': D.h3 }[td.level] || D.h2;
    return <div style={s}><C text={content} /></div>;
  }

  if (tag === 'answer') return (
    <div style={D.answerBlock}>
      <div style={D.answerLabel}>Answer{td.question_id ? ` — Q ${td.question_id}` : ''}</div>
      {children}
    </div>
  );

  // ── Math ──────────────────────────────────────────────────────────────────

  if (tag === 'math_inline') return (
    <span style={{ margin: '0 0.15em' }}>{mathInline(content, 'mi')}</span>
  );
  if (tag === 'math_block') return mathBlock(content);

  if (tag === 'ce') {
    try {
      return <div style={{ margin: '0.4em 0' }} dangerouslySetInnerHTML={{ __html: katex.renderToString(`\\ce{${content}}`, { throwOnError: false }) }} />;
    } catch { return <p style={D.p}><code style={{ fontFamily: 'monospace' }}>{content}</code></p>; }
  }

  // ── Corrections ──────────────────────────────────────────────────────────

  if (tag === 'sout') return (
    <p style={D.p}><span style={{ textDecoration: 'line-through' }}><C text={content} /></span></p>
  );
  if (tag === 'underline') return (
    <p style={D.p}><span style={{ textDecoration: 'underline' }}><C text={content} /></span></p>
  );
  if (tag === 'circle') return (
    <p style={D.p}>
      <span style={{ border: '1px solid #111', borderRadius: '50%', padding: '1px 6px', whiteSpace: 'nowrap' }}><C text={content} /></span>
    </p>
  );
  if (tag === 'overwrite') return (
    <p style={D.p}>
      <span style={{ textDecoration: 'line-through', marginRight: '0.4em' }}><C text={td.original || ''} /></span>
      <C text={content} />
    </p>
  );
  if (tag === 'insert') return (
    <p style={{ ...D.p, fontStyle: 'italic', fontSize: '0.93em' }}>↑ <C text={content} /></p>
  );
  if (tag === 'scribble') return (
    <p style={{ ...D.p, fontStyle: 'italic' }}>{content || '[scribble]'}</p>
  );
  if (tag === 'illegible') return (
    <p style={{ ...D.p, fontStyle: 'italic' }}>[illegible{td.guessed ? `: ${td.guessed}` : ''}]</p>
  );
  if (tag === 'overlap') return <p style={D.p}><C text={content} /></p>;

  // ── Notes / arrows ────────────────────────────────────────────────────────

  if (tag === 'marginnote') return (
    <p style={{ ...D.p, fontStyle: 'italic', fontSize: '0.9em' }}><C text={content} /></p>
  );

  if (tag === 'arrow_start') return (
    <div data-conn-type="start" data-conn-id={`a-${td.pair_id ?? ''}`}>
      {content && <p style={D.p}><C text={content} /></p>}
      {children}
    </div>
  );
  if (tag === 'arrow_target') return (
    <div data-conn-type="target" data-conn-id={`a-${td.pair_id ?? ''}`}>
      {content && <p style={D.p}><C text={content} /></p>}
      {children}
    </div>
  );
  if (tag === 'page_start') return (
    <div data-conn-type="start" data-conn-id={`p-${td.pair_id ?? ''}`}>
      {content && <p style={D.p}><C text={content} />{td.target_page ? ` (→ p.${td.target_page})` : ''}</p>}
      {children}
    </div>
  );
  if (tag === 'page_target') return (
    <div data-conn-type="target" data-conn-id={`p-${td.pair_id ?? ''}`}>
      {content && <p style={D.p}><C text={content} /></p>}
      {children}
    </div>
  );

  // ── Lists ─────────────────────────────────────────────────────────────────

  if (tag === 'enumerate') {
    const items = (content || '').split('\n').filter(Boolean);
    return <ol style={D.ol}>{items.map((it, i) => <li key={i} style={D.li}><C text={it.trim()} /></li>)}{children}</ol>;
  }
  if (tag === 'itemize') {
    const items = (content || '').split('\n').filter(Boolean);
    return <ul style={D.ul}>{items.map((it, i) => <li key={i} style={D.li}><C text={it.trim()} /></li>)}{children}</ul>;
  }

  // ── Table (booktabs) ──────────────────────────────────────────────────────

  if (tag === 'tabular') {
    const rows = (content || '').split('\\\\').map((r) => r.split('&').map((c) => c.trim())).filter((r) => r.some(Boolean));
    const last = rows.length - 1;
    return (
      <table style={D.table}>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} style={{
                  ...D.td,
                  borderTop:    i === 0 ? '1.5px solid #111' : i === 1 ? '0.75px solid #555' : 'none',
                  borderBottom: i === last ? '1.5px solid #111' : 'none',
                }}>
                  <C text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // ── Document-type containers ──────────────────────────────────────────────

  const DOC = { formalletter: 'Formal Letter', letter_informal: 'Letter', notice: 'Notice', application: 'Application', rough: 'Rough Work', spread: 'Spread' };
  if (DOC[tag]) return (
    <div style={D.sectionWrap}>
      <div style={D.sectionLabel}>{DOC[tag]}</div>
      <div style={D.sectionBody}>
        {content && content.split('\n').filter(Boolean).map((l, i) => <p key={i} style={D.p}><C text={l} /></p>)}
        {children}
      </div>
    </div>
  );

  // ── Visual elements ───────────────────────────────────────────────────────

  if (tag === 'diagram')   { const m = [td.diagram_type, td.correctness].filter(Boolean); return <p style={{ ...D.p, fontStyle: 'italic' }}>[Diagram{m.length ? ': ' + m.join(', ') : ''}]</p>; }
  if (tag === 'graph')     { const m = [td.graph_type, td.written_solution && `ans: ${td.written_solution}`].filter(Boolean); return <p style={{ ...D.p, fontStyle: 'italic' }}>[Graph{m.length ? ': ' + m.join(', ') : ''}]</p>; }
  if (tag === 'map')       return <p style={{ ...D.p, fontStyle: 'italic' }}>[Map{td.map_type ? ': ' + td.map_type : ''}]</p>;
  if (tag === 'flowchart') return <p style={{ ...D.p, fontStyle: 'italic' }}>[Flowchart{td.completeness ? ': ' + td.completeness : ''}]</p>;

  // ── Scores / teacher ─────────────────────────────────────────────────────

  if (tag === 'hwscore') {
    const dims = ['letter_formation', 'sizing_consistency', 'spacing', 'alignment', 'pen_pressure', 'neatness'];
    const scores = dims.filter((d) => td[d] != null).map((d) => `${d.replace(/_/g, ' ')} ${td[d]}/5`);
    return (
      <p style={{ ...D.p, fontSize: '0.88em' }}>
        Handwriting: {scores.join(', ')}{td.overall != null ? ` — overall ${td.overall}/5` : ''}
      </p>
    );
  }

  if (tag === 'prosody_kannada') return (
    <div style={D.sectionWrap}>
      <div style={D.sectionLabel}>Prosody (Kannada)</div>
      {td.source_text && <p style={D.p}>{td.source_text}</p>}
      {td.chanda && <p style={{ ...D.p, fontSize: '0.88em' }}>Chanda: {td.chanda}</p>}
    </div>
  );

  if (tag === 'teacher_mark') return (
    <p style={{ ...D.p, fontSize: '0.88em' }}>[{td.mark_type || 'mark'}]</p>
  );
  if (tag === 'teacher_score') return (
    <p style={D.p}>
      <span style={{ fontSize: '0.75em', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '8px' }}>Score</span>
      <span style={{ fontWeight: 700 }}>{td.raw_text || `${td.value ?? '?'}/${td.max ?? '?'}`}</span>
    </p>
  );
  if (tag === 'teacher_comment') return (
    <p style={{ ...D.p, fontStyle: 'italic' }}>&ldquo;<C text={content} />&rdquo;</p>
  );
  if (tag === 'stamp_circular') return (
    <p style={{ ...D.p, fontSize: '0.88em' }}>[{td.outer_text || 'stamp'}]</p>
  );

  if (tag === 'metadata') {
    const parts = [td.question_number && `Q${td.question_number}`, td.page_number && `p. ${td.page_number}`].filter(Boolean);
    return parts.length ? <p style={{ ...D.p, fontSize: '0.82em' }}>{parts.join(' ')}</p> : null;
  }

  return content ? <p style={D.p}><C text={content} /></p> : null;
}

// ── Tree ──────────────────────────────────────────────────────────────────────

function sortByOrder(boxes) {
  return [...boxes].sort((a, b) => {
    if (a.reading_order == null && b.reading_order == null) return a.id - b.id;
    if (a.reading_order == null) return 1;
    if (b.reading_order == null) return -1;
    return a.reading_order - b.reading_order;
  });
}

function RenderTree({ boxes, selectedBoxId }) {
  const childMap = useMemo(() => {
    const map = {};
    for (const b of boxes) {
      const pid = b.parent_box_id ?? null;
      if (!map[pid]) map[pid] = [];
      map[pid].push(b);
    }
    return map;
  }, [boxes]);

  function renderLevel(pid) {
    return sortByOrder(childMap[pid] || []).map((box) => {
      const color = getTagColour(box.tag_category);
      const isSelected = box.id === selectedBoxId;
      return (
        <div
          key={box.id}
          data-box-id={box.id}
          style={{
            outline: isSelected ? `2px solid ${color}` : `1px solid ${color}44`,
            backgroundColor: isSelected ? `${color}12` : 'transparent',
            borderRadius: '2px',
            margin: '1px 0',
          }}
        >
          <Tag box={box}>{renderLevel(box.id)}</Tag>
        </div>
      );
    });
  }
  return <>{renderLevel(null)}</>;
}

// ── SVG connector overlay ─────────────────────────────────────────────────────
// Draws dashed right-margin lines connecting matched arrow/page pairs.

const CX = 26;
const TK = 10;

const GAP = 5; // px gap between bracket and arrow

function Connectors({ lines, height }) {
  if (!lines.length) return null;
  return (
    <svg
      aria-hidden="true"
      style={{ position: 'absolute', top: 0, right: 0, width: CX + 8, height, pointerEvents: 'none', overflow: 'visible' }}
    >
      {lines.map(({ id, y1, y1h, y2, y2h }) => {
        const connStart = y1 + y1h + GAP;
        const connEnd   = y2 - GAP - 7; // 7px for arrowhead
        return (
          <g key={id}>
            {/* Start ] bracket — vertical bar + inward ticks */}
            <line x1={CX - TK} y1={y1}       x2={CX} y2={y1}       stroke="#999" strokeWidth="1.5" strokeLinecap="square" />
            <line x1={CX}      y1={y1}       x2={CX} y2={y1 + y1h} stroke="#999" strokeWidth="1.5" />
            <line x1={CX - TK} y1={y1 + y1h} x2={CX} y2={y1 + y1h} stroke="#999" strokeWidth="1.5" strokeLinecap="square" />

            {/* Dashed connecting line — clearly separate from both brackets */}
            {connEnd > connStart && (
              <line x1={CX} y1={connStart} x2={CX} y2={connEnd} stroke="#ccc" strokeWidth="1" strokeDasharray="4 3" />
            )}

            {/* Arrowhead — pointing down, above target bracket */}
            <polygon points={`${CX - 4},${y2 - GAP - 7} ${CX + 4},${y2 - GAP - 7} ${CX},${y2 - GAP}`} fill="#999" />

            {/* Target [ bracket */}
            <line x1={CX - TK} y1={y2}       x2={CX} y2={y2}       stroke="#999" strokeWidth="1.5" strokeLinecap="square" />
            <line x1={CX}      y1={y2}       x2={CX} y2={y2 + y2h} stroke="#999" strokeWidth="1.5" />
            <line x1={CX - TK} y1={y2 + y2h} x2={CX} y2={y2 + y2h} stroke="#999" strokeWidth="1.5" strokeLinecap="square" />
          </g>
        );
      })}
    </svg>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function Renderer({ boxes, selectedBoxId }) {
  const pageRef = useRef(null);
  const [drawData, setDrawData] = useState({ lines: [], height: 0 });

  const tagged = useMemo(() => boxes.filter((b) => b.tag_category), [boxes]);

  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const cRect = page.getBoundingClientRect();
    const height = page.scrollHeight;
    const lines = [];

    page.querySelectorAll('[data-conn-type="start"]').forEach((startEl) => {
      const connId = startEl.dataset.connId;
      if (!connId) return;
      const targetEl = [...page.querySelectorAll('[data-conn-type="target"]')].find((t) => t.dataset.connId === connId);
      if (!targetEl) return;
      const r1 = startEl.getBoundingClientRect();
      const r2 = targetEl.getBoundingClientRect();
      lines.push({ id: connId, y1: r1.top - cRect.top, y1h: r1.height, y2: r2.top - cRect.top, y2h: r2.height });
    });

    setDrawData({ lines, height });
  }, [tagged]);

  useEffect(() => {
    if (!selectedBoxId || !pageRef.current) return;
    const el = pageRef.current.querySelector(`[data-box-id="${selectedBoxId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedBoxId]);

  return (
    <div style={{ backgroundColor: '#e4e4e4', padding: '12px', minHeight: '100%', boxSizing: 'border-box' }}>
      <div
        ref={pageRef}
        style={{
          position: 'relative',
          backgroundColor: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15), 0 4px 14px rgba(0,0,0,0.08)',
          padding: '9% 10% 9% 9%',
          aspectRatio: '210 / 297',
          boxSizing: 'border-box',
          ...D.body,
        }}
      >
        {tagged.length === 0
          ? <p style={{ fontStyle: 'italic', color: '#bbb', fontFamily: FONT, fontSize: '14px' }}>No annotated boxes yet.</p>
          : <RenderTree boxes={tagged} selectedBoxId={selectedBoxId} />
        }
        <Connectors lines={drawData.lines} height={drawData.height} />
      </div>
    </div>
  );
}
