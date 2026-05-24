const GROUPS = [
  {
    label: 'Structure',
    buttons: [
      { label: 'x²', insert: '^{}', offset: -1 },
      { label: 'x₂', insert: '_{}', offset: -1 },
      { label: '¹/₂', insert: '\\frac{}{}', offset: -3 },
      { label: '√x', insert: '\\sqrt{}', offset: -1 },
      { label: 'ⁿ√x', insert: '\\sqrt[n]{}', offset: -1 },
      { label: '|x|', insert: '\\left|\\right|', offset: -8 },
    ],
  },
  {
    label: 'Operators',
    buttons: [
      { label: '±', insert: '\\pm' },
      { label: '×', insert: '\\times' },
      { label: '÷', insert: '\\div' },
      { label: '·', insert: '\\cdot' },
      { label: '≤', insert: '\\leq' },
      { label: '≥', insert: '\\geq' },
      { label: '≠', insert: '\\neq' },
      { label: '≈', insert: '\\approx' },
      { label: '∞', insert: '\\infty' },
      { label: '∝', insert: '\\propto' },
    ],
  },
  {
    label: 'Functions',
    buttons: [
      { label: 'sin', insert: '\\sin' },
      { label: 'cos', insert: '\\cos' },
      { label: 'tan', insert: '\\tan' },
      { label: 'log', insert: '\\log' },
      { label: 'ln', insert: '\\ln' },
      { label: 'lim', insert: '\\lim_{}', offset: -1 },
      { label: '∑', insert: '\\sum_{}^{}', offset: -3 },
      { label: '∏', insert: '\\prod_{}^{}', offset: -3 },
      { label: '∫', insert: '\\int_{}^{}', offset: -3 },
    ],
  },
  {
    label: 'Greek',
    buttons: [
      { label: 'α', insert: '\\alpha' },
      { label: 'β', insert: '\\beta' },
      { label: 'γ', insert: '\\gamma' },
      { label: 'δ', insert: '\\delta' },
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
    ],
  },
  {
    label: 'Sets / Logic',
    buttons: [
      { label: '∈', insert: '\\in' },
      { label: '∉', insert: '\\notin' },
      { label: '⊂', insert: '\\subset' },
      { label: '⊆', insert: '\\subseteq' },
      { label: '∪', insert: '\\cup' },
      { label: '∩', insert: '\\cap' },
      { label: '∅', insert: '\\emptyset' },
      { label: '∀', insert: '\\forall' },
      { label: '∃', insert: '\\exists' },
      { label: '¬', insert: '\\neg' },
      { label: '∧', insert: '\\wedge' },
      { label: '∨', insert: '\\vee' },
      { label: '→', insert: '\\rightarrow' },
      { label: '⟺', insert: '\\Leftrightarrow' },
    ],
  },
  {
    label: 'Brackets',
    buttons: [
      { label: '( )', insert: '\\left(\\right)', offset: -7 },
      { label: '[ ]', insert: '\\left[\\right]', offset: -7 },
      { label: '{ }', insert: '\\{\\}', offset: -2 },
      { label: '⌊ ⌋', insert: '\\lfloor \\rfloor', offset: -7 },
      { label: '⌈ ⌉', insert: '\\lceil \\rceil', offset: -6 },
    ],
  },
];

const S = {
  root: { borderTop: '1px solid #e8e0f0', backgroundColor: '#faf8ff', padding: '6px 8px' },
  groupLabel: { fontSize: '10px', color: '#888', fontWeight: '600', marginBottom: '3px', marginTop: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  btnRow: { display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '2px' },
  btn: {
    padding: '4px 7px', fontSize: '13px', border: '1px solid #c9b9e8',
    borderRadius: '3px', cursor: 'pointer', backgroundColor: '#fff',
    color: '#5b3fa0', fontFamily: 'serif', lineHeight: '1.2',
    userSelect: 'none',
  },
};

export default function MathKeyboard({ onInsert }) {
  return (
    <div style={S.root}>
      {GROUPS.map((group) => (
        <div key={group.label}>
          <div style={S.groupLabel}>{group.label}</div>
          <div style={S.btnRow}>
            {group.buttons.map((btn) => (
              <button
                key={btn.label}
                style={S.btn}
                onMouseDown={(e) => {
                  e.preventDefault(); // don't steal focus from textarea
                  onInsert(btn.insert, btn.offset ?? 0);
                }}
                title={btn.insert}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
