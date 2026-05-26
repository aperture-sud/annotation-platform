const GROUPS = [
  {
    label: 'Formatting',
    keys: [
      { label: 'under', insert: '\\underline{}', offset: -1 },
      { label: 'bold',  insert: '\\textbf{}',    offset: -1 },
      { label: 'italic',insert: '\\textit{}',    offset: -1 },
      { label: 'strike',insert: '\\sout{}',      offset: -1 },
      { label: 'circle',insert: '\\circle{}',    offset: -1 },
      { label: 'over',  insert: '\\overline{}',  offset: -1 },
    ],
  },
  {
    label: 'Structure',
    keys: [
      { label: 'xⁿ',   insert: '^{}',           offset: -1 },
      { label: 'xₙ',   insert: '_{}',           offset: -1 },
      { label: 'a/b',  insert: '\\frac{}{}',    offset: -3 },
      { label: '√',    insert: '\\sqrt{}',      offset: -1 },
      { label: 'vec',  insert: '\\vec{}',       offset: -1 },
      { label: 'hat',  insert: '\\hat{}',       offset: -1 },
    ],
  },
  {
    label: 'Operators',
    keys: [
      { label: '±',  insert: '\\pm' },
      { label: '×',  insert: '\\times' },
      { label: '÷',  insert: '\\div' },
      { label: '·',  insert: '\\cdot' },
      { label: '≠',  insert: '\\neq' },
      { label: '≤',  insert: '\\leq' },
      { label: '≥',  insert: '\\geq' },
      { label: '≈',  insert: '\\approx' },
      { label: '≡',  insert: '\\equiv' },
      { label: '∝',  insert: '\\propto' },
      { label: '∞',  insert: '\\infty' },
    ],
  },
  {
    label: 'Functions',
    keys: [
      { label: 'sin',  insert: '\\sin' },
      { label: 'cos',  insert: '\\cos' },
      { label: 'tan',  insert: '\\tan' },
      { label: 'log',  insert: '\\log' },
      { label: 'ln',   insert: '\\ln' },
      { label: 'lim',  insert: '\\lim_{}',     offset: -1 },
      { label: 'Σ',    insert: '\\sum_{}^{}',  offset: -3 },
      { label: '∫',    insert: '\\int_{}^{}',  offset: -3 },
    ],
  },
  {
    label: 'Greek',
    keys: [
      { label: 'α', insert: '\\alpha' },
      { label: 'β', insert: '\\beta' },
      { label: 'γ', insert: '\\gamma' },
      { label: 'δ', insert: '\\delta' },
      { label: 'ε', insert: '\\epsilon' },
      { label: 'θ', insert: '\\theta' },
      { label: 'λ', insert: '\\lambda' },
      { label: 'μ', insert: '\\mu' },
      { label: 'π', insert: '\\pi' },
      { label: 'σ', insert: '\\sigma' },
      { label: 'φ', insert: '\\phi' },
      { label: 'ω', insert: '\\omega' },
      { label: 'Δ', insert: '\\Delta' },
      { label: 'Σ', insert: '\\Sigma' },
      { label: 'Ω', insert: '\\Omega' },
      { label: 'Λ', insert: '\\Lambda' },
    ],
  },
  {
    label: 'Sets & Logic',
    keys: [
      { label: '∈',  insert: '\\in' },
      { label: '∉',  insert: '\\notin' },
      { label: '⊂',  insert: '\\subset' },
      { label: '⊃',  insert: '\\supset' },
      { label: '∪',  insert: '\\cup' },
      { label: '∩',  insert: '\\cap' },
      { label: '∅',  insert: '\\emptyset' },
      { label: '∀',  insert: '\\forall' },
      { label: '∃',  insert: '\\exists' },
      { label: '∴',  insert: '\\therefore' },
      { label: '∵',  insert: '\\because' },
    ],
  },
  {
    label: 'Brackets',
    keys: [
      { label: '(…)', insert: '\\left(\\right)',   offset: -7 },
      { label: '[…]', insert: '\\left[\\right]',   offset: -7 },
      { label: '{…}', insert: '\\left\\{\\right\\}', offset: -8 },
      { label: '|…|', insert: '\\left|\\right|',   offset: -7 },
    ],
  },
];

function insertAtCursor(text, cursorOffset = 0) {
  const el = document.activeElement;
  if (!el || (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT')) return;
  const start = el.selectionStart ?? el.value.length;
  const end   = el.selectionEnd   ?? el.value.length;
  const newVal = el.value.slice(0, start) + text + el.value.slice(end);
  // Use native setter so React's onChange fires correctly
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) {
    setter.call(el, newVal);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  requestAnimationFrame(() => {
    const pos = start + text.length + cursorOffset;
    el.setSelectionRange(pos, pos);
    el.focus();
  });
}

const S = {
  panel: {
    padding: '10px 8px',
    fontSize: '12px',
    userSelect: 'none',
  },
  groupLabel: {
    fontSize: '10px', fontWeight: '700', color: '#999',
    textTransform: 'uppercase', letterSpacing: '0.5px',
    marginBottom: '4px', marginTop: '10px',
  },
  keyRow: { display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '2px' },
  key: {
    padding: '3px 7px', fontSize: '12px', border: '1px solid #ddd',
    borderRadius: '3px', cursor: 'pointer', backgroundColor: '#fafafa',
    color: '#333', lineHeight: '1.4',
  },
};

export default function UniversalKeyboard() {
  return (
    // onMouseDown preventDefault stops any click from stealing textarea focus
    <div style={S.panel} onMouseDown={(e) => e.preventDefault()}>
      {GROUPS.map((group) => (
        <div key={group.label}>
          <div style={S.groupLabel}>{group.label}</div>
          <div style={S.keyRow}>
            {group.keys.map((k) => (
              <button
                key={k.label}
                style={S.key}
                onClick={() => insertAtCursor(k.insert, k.offset ?? 0)}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
