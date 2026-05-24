// Maps tag type → { label, colour, latex_cmd, is_environment, fields[] }
export const TAG_SCHEMAS = {

  // ── TEXT ─────────────────────────────────────────────────────────────────────
  text: {
    label: 'Text',
    colour: '#2196F3',
    latex_cmd: '\\text',
    fields: [
      { name: 'style', type: 'select', label: 'Style', options: ['handwritten', 'printed', 'mixed'] },
      { name: 'lang', type: 'select', label: 'Language', options: ['english', 'kannada'] },
      { name: 'content', type: 'textarea', label: 'Transcription', required: true },
    ],
  },
  line: {
    label: 'Line',
    colour: '#1976D2',
    latex_cmd: '\\line',
    fields: [
      { name: 'indent', type: 'select', label: 'Indent level', options: ['0', '1', '2', '3', '4', 'center'] },
      { name: 'content', type: 'textarea', label: 'Text content', required: true },
      { name: 'continuation_of', type: 'text', label: 'Continues box ID (overflow line)' },
    ],
  },
  heading: {
    label: 'Heading',
    colour: '#1565C0',
    latex_cmd: '\\heading',
    fields: [
      { name: 'level', type: 'select', label: 'Level', options: ['1', '2', '3'] },
      { name: 'content', type: 'textarea', label: 'Heading text', required: true },
    ],
  },
  paragraph: {
    label: 'Paragraph',
    colour: '#42A5F5',
    latex_cmd: '\\begin{paragraph}',
    is_environment: true,
    fields: [
      { name: 'lang', type: 'select', label: 'Language', options: ['english', 'kannada'] },
      { name: 'content', type: 'textarea', label: 'Full text (sentences separated by newlines)', required: true },
    ],
  },

  // ── CORRECTIONS ──────────────────────────────────────────────────────────────
  sout: {
    label: 'Strikethrough',
    colour: '#F44336',
    latex_cmd: '\\sout / $\\cancel{}$',
    fields: [
      { name: 'in_math', type: 'boolean', label: 'Inside math expression (use \\cancel{})' },
      { name: 'lines', type: 'number', label: 'Number of strike lines', min: 1 },
      { name: 'content', type: 'textarea', label: 'Struck-out text' },
    ],
  },
  scribble: {
    label: 'Scribble',
    colour: '#FF5722',
    latex_cmd: '\\scribble',
    fields: [
      { name: 'partial', type: 'boolean', label: 'Partially legible' },
      { name: 'content', type: 'textarea', label: 'Readable portions (use [?] for gaps)' },
    ],
  },
  overwrite: {
    label: 'Overwrite',
    colour: '#FF9800',
    latex_cmd: '\\overwrite',
    fields: [
      { name: 'original', type: 'textarea', label: 'Original text (if visible)' },
      { name: 'content', type: 'textarea', label: 'New text written over (replacement)' },
    ],
  },
  insert: {
    label: 'Insertion',
    colour: '#FFA726',
    latex_cmd: '\\insertabove / \\insertbelow / \\insertinline',
    fields: [
      { name: 'direction', type: 'select', label: 'Insert direction', options: ['above', 'below', 'inline'] },
      { name: 'content', type: 'textarea', label: 'Inserted text', required: true },
    ],
  },
  underline: {
    label: 'Underline',
    colour: '#EF5350',
    latex_cmd: '\\underline',
    fields: [
      { name: 'content', type: 'textarea', label: 'Underlined text' },
    ],
  },
  circle: {
    label: 'Circle',
    colour: '#E91E63',
    latex_cmd: '\\circle',
    fields: [
      { name: 'content', type: 'textarea', label: 'Circled / boxed text or content' },
    ],
  },
  illegible: {
    label: 'Illegible',
    colour: '#9E9E9E',
    latex_cmd: '\\illegible',
    fields: [
      { name: 'guessed', type: 'textarea', label: 'Best guess (optional)' },
    ],
  },
  overlap: {
    label: 'Overlap',
    colour: '#795548',
    latex_cmd: '\\overlap',
    fields: [
      { name: 'description', type: 'textarea', label: 'Description (teacher wrote over student content — flag for human review)' },
    ],
  },

  // ── CONTINUATIONS ────────────────────────────────────────────────────────────
  arrow_start: {
    label: 'Arrow Start',
    colour: '#FF9800',
    latex_cmd: '\\arrow_start',
    fields: [
      { name: 'pair_id', type: 'text', label: 'Pair ID (must match arrow_target)', required: true },
      { name: 'content', type: 'textarea', label: 'Text at arrow origin' },
    ],
  },
  arrow_target: {
    label: 'Arrow Target',
    colour: '#FF9800',
    latex_cmd: '\\arrow_target',
    fields: [
      { name: 'pair_id', type: 'text', label: 'Pair ID (must match arrow_start)', required: true },
      { name: 'content', type: 'textarea', label: 'Text at arrow destination' },
    ],
  },
  page_start: {
    label: 'Page-continue Start',
    colour: '#FF6F00',
    latex_cmd: '\\page_start',
    fields: [
      { name: 'pair_id', type: 'text', label: 'Pair ID (must match page_target)', required: true },
      { name: 'target_page', type: 'text', label: 'Target page number' },
      { name: 'content', type: 'textarea', label: 'Text (beginning of continuation)' },
    ],
  },
  page_target: {
    label: 'Page-continue Target',
    colour: '#FF6F00',
    latex_cmd: '\\page_target',
    fields: [
      { name: 'pair_id', type: 'text', label: 'Pair ID (must match page_start)', required: true },
      { name: 'content', type: 'textarea', label: 'Text (continuation)' },
    ],
  },
  marginnote: {
    label: 'Margin Note',
    colour: '#F57C00',
    latex_cmd: '\\marginnote',
    fields: [
      { name: 'side', type: 'select', label: 'Margin side', options: ['left', 'right', 'top', 'bottom'] },
      { name: 'content', type: 'textarea', label: 'Note text', required: true },
    ],
  },

  // ── MATH ─────────────────────────────────────────────────────────────────────
  math_inline: {
    label: 'Math (inline)',
    colour: '#9C27B0',
    latex_cmd: '$...$',
    fields: [
      { name: 'content', type: 'textarea', label: 'LaTeX math notation', required: true },
    ],
  },
  math_block: {
    label: 'Math (block)',
    colour: '#7B1FA2',
    latex_cmd: '\\[...\\]',
    fields: [
      { name: 'content', type: 'textarea', label: 'LaTeX math notation', required: true },
    ],
  },
  ce: {
    label: 'Chemical Equation',
    colour: '#4CAF50',
    latex_cmd: '\\ce{}',
    fields: [
      { name: 'reaction_type', type: 'select', label: 'Reaction type', options: ['forward', 'equilibrium', 'backward', 'other'] },
      { name: 'content', type: 'textarea', label: 'mhchem notation (e.g. 2H2 + O2 -> 2H2O)', required: true },
    ],
  },

  // ── STRUCTURE ────────────────────────────────────────────────────────────────
  tabular: {
    label: 'Table',
    colour: '#009688',
    latex_cmd: '\\begin{tabular}',
    is_environment: true,
    fields: [
      { name: 'rows', type: 'number', label: 'Rows', min: 1 },
      { name: 'cols', type: 'number', label: 'Columns', min: 1 },
      { name: 'has_header', type: 'boolean', label: 'Has header row' },
      { name: 'column_align', type: 'text', label: 'Column alignment (e.g. |l|c|r|)' },
      { name: 'content', type: 'textarea', label: 'Cells row by row (& separated, \\\\ for new row)' },
    ],
  },
  enumerate: {
    label: 'Numbered List',
    colour: '#00BCD4',
    latex_cmd: '\\begin{enumerate}',
    is_environment: true,
    fields: [
      { name: 'content', type: 'textarea', label: 'List items (one per line)', required: true },
    ],
  },
  itemize: {
    label: 'Bullet List',
    colour: '#0097A7',
    latex_cmd: '\\begin{itemize}',
    is_environment: true,
    fields: [
      { name: 'content', type: 'textarea', label: 'List items (one per line)', required: true },
    ],
  },

  // ── DOCUMENT ─────────────────────────────────────────────────────────────────
  formalletter: {
    label: 'Formal Letter',
    colour: '#E91E63',
    latex_cmd: '\\begin{formalletter}',
    is_environment: true,
    fields: [
      { name: 'has_sender_address', type: 'boolean', label: 'Sender address present' },
      { name: 'has_date', type: 'boolean', label: 'Date present' },
      { name: 'has_receiver_address', type: 'boolean', label: 'Receiver address present' },
      { name: 'has_salutation', type: 'boolean', label: 'Salutation present' },
      { name: 'has_subject', type: 'boolean', label: 'Subject line present' },
      { name: 'has_closing', type: 'boolean', label: 'Closing present' },
      { name: 'has_signature', type: 'boolean', label: 'Signature present' },
      { name: 'content', type: 'textarea', label: 'Full letter text' },
    ],
  },
  letter_informal: {
    label: 'Informal Letter',
    colour: '#C2185B',
    latex_cmd: '\\begin{letter}',
    is_environment: true,
    fields: [
      { name: 'has_salutation', type: 'boolean', label: 'Salutation present' },
      { name: 'has_closing', type: 'boolean', label: 'Closing present' },
      { name: 'content', type: 'textarea', label: 'Full letter text' },
    ],
  },
  notice: {
    label: 'Notice',
    colour: '#AD1457',
    latex_cmd: '\\begin{notice}',
    is_environment: true,
    fields: [
      { name: 'institution', type: 'text', label: 'Institution name' },
      { name: 'title', type: 'text', label: 'Notice title' },
      { name: 'has_heading', type: 'boolean', label: 'NOTICE heading present' },
      { name: 'has_date', type: 'boolean', label: 'Date present' },
      { name: 'has_issuer', type: 'boolean', label: 'Issuer name present' },
      { name: 'content', type: 'textarea', label: 'Notice body text' },
    ],
  },
  application: {
    label: 'Application',
    colour: '#880E4F',
    latex_cmd: '\\begin{application}',
    is_environment: true,
    fields: [
      { name: 'content', type: 'textarea', label: 'Application text' },
    ],
  },

  // ── VISUAL ───────────────────────────────────────────────────────────────────
  graph: {
    label: 'Graph / Chart',
    colour: '#8BC34A',
    latex_cmd: '\\begin{graph}',
    is_environment: true,
    fields: [
      { name: 'graph_type', type: 'select', label: 'Graph type', options: ['line', 'bar', 'pie', 'scatter', 'histogram', 'other'] },
      // Axes
      { name: 'x_label', type: 'text', label: 'X-axis label' },
      { name: 'x_unit', type: 'text', label: 'X-axis unit' },
      { name: 'x_min', type: 'number', label: 'X min' },
      { name: 'x_max', type: 'number', label: 'X max' },
      { name: 'y_label', type: 'text', label: 'Y-axis label' },
      { name: 'y_unit', type: 'text', label: 'Y-axis unit' },
      { name: 'y_min', type: 'number', label: 'Y min' },
      { name: 'y_max', type: 'number', label: 'Y max' },
      // Calibration transform matrix
      { name: 'calib_mx', type: 'number', label: 'Calibration mx (units/px, x-axis)' },
      { name: 'calib_my', type: 'number', label: 'Calibration my (units/px, y-axis, negative)' },
      { name: 'calib_cx', type: 'number', label: 'Calibration cx (x offset)' },
      { name: 'calib_cy', type: 'number', label: 'Calibration cy (y offset)' },
      { name: 'calib_r2', type: 'number', label: 'Calibration R²', min: 0, max: 1 },
      // Curves & results
      { name: 'curves', type: 'textarea', label: 'Curves (one per line: type, fit eq, R², expected)' },
      { name: 'intersections', type: 'textarea', label: 'Intersection points (x,y pairs, one per line)' },
      { name: 'written_solution', type: 'text', label: 'Written solution / answer' },
      { name: 'table_of_values_present', type: 'boolean', label: 'Table of values present' },
      { name: 'table_correct', type: 'number', label: 'Table: correct entries', min: 0 },
      { name: 'table_total', type: 'number', label: 'Table: total entries', min: 0 },
      { name: 'notes', type: 'textarea', label: 'Notes' },
    ],
  },
  map: {
    label: 'Map',
    colour: '#CDDC39',
    latex_cmd: '\\begin{map}',
    is_environment: true,
    fields: [
      { name: 'map_type', type: 'select', label: 'Map type', options: ['india', 'world', 'regional', 'river_system', 'other'] },
      { name: 'anchor_points', type: 'textarea', label: 'Calibration anchor points (label: pixel x,y → lat,lon — one per line)' },
      { name: 'markings', type: 'textarea', label: 'Student markings (label: type, pixel x,y — one per line)' },
      { name: 'marks_correct', type: 'number', label: 'Correct marks', min: 0 },
      { name: 'marks_total', type: 'number', label: 'Total marks expected', min: 0 },
      { name: 'notes', type: 'textarea', label: 'Notes / describe markings' },
    ],
  },
  diagram: {
    label: 'Diagram',
    colour: '#3F51B5',
    latex_cmd: '\\begin{diagram}',
    is_environment: true,
    fields: [
      // Layer 1 — Identification
      { name: 'diagram_type', type: 'select', label: 'L1 — Diagram type', options: ['human_heart', 'neuron', 'plant_cell', 'animal_cell', 'nephron', 'eye', 'ear', 'ray_diagram', 'circuit', 'other'] },
      { name: 'subject', type: 'select', label: 'L1 — Subject', options: ['biology', 'physics', 'chemistry', 'geography', 'other'] },
      { name: 'completeness', type: 'select', label: 'L1 — Completeness', options: ['complete', 'partial', 'attempted'] },
      { name: 'correctness', type: 'select', label: 'L1 — Correctness', options: ['correct', 'mostly_correct', 'partially_correct', 'incorrect'] },
      // Layer 2 — Components
      { name: 'labels_found', type: 'textarea', label: 'L2 — Labels found (comma-separated)' },
      { name: 'missing_labels', type: 'textarea', label: 'L2 — Labels missing (comma-separated)' },
      // Layer 3 — Position relations
      { name: 'position_relations', type: 'textarea', label: 'L3 — Position relations (e.g. "left_atrium above left_ventricle", one per line)' },
      // Layer 4 — Shapes
      { name: 'shape_descriptions', type: 'textarea', label: 'L4 — Shape descriptions (e.g. "left_ventricle: oval, large")' },
      // Layer 5 — Free text
      { name: 'description', type: 'textarea', label: 'L5 — Free structural description' },
      // Layer 6 — Neatness
      { name: 'neatness', type: 'number', label: 'L6 — Neatness score (0–5)', min: 0, max: 5 },
      { name: 'neatness_flag', type: 'boolean', label: 'L6 — Flag for human review' },
    ],
  },
  flowchart: {
    label: 'Flowchart',
    colour: '#303F9F',
    latex_cmd: '\\begin{flowchart}',
    is_environment: true,
    fields: [
      { name: 'completeness', type: 'select', label: 'Completeness', options: ['complete', 'partial', 'attempted'] },
      { name: 'description', type: 'textarea', label: 'Description' },
      { name: 'notes', type: 'textarea', label: 'Notes' },
    ],
  },

  // ── LANGUAGE ─────────────────────────────────────────────────────────────────
  prosody_kannada: {
    label: 'Prosody (Kannada)',
    colour: '#AB47BC',
    latex_cmd: '\\begin{prosody}[lang=kannada]',
    is_environment: true,
    fields: [
      { name: 'source_text', type: 'textarea', label: 'Base Kannada text (syllables + pipe dividers)', required: true },
      { name: 'prastara_present', type: 'boolean', label: 'Prastara present (pipe | dividers)' },
      { name: 'gana_marks_present', type: 'boolean', label: 'Gana marks present (∪ / —)' },
      { name: 'laghu_guru_pattern', type: 'text', label: 'Laghu/Guru pattern (e.g. ∪——∪∪)' },
      { name: 'gana_labels', type: 'text', label: 'Gana names (e.g. ಯಗಣ, ಮಗಣ)' },
      { name: 'chanda', type: 'text', label: 'Chanda identified (e.g. ಷಟ್ಪದಿ)' },
    ],
  },
  hwscore: {
    label: 'Handwriting Score',
    colour: '#CE93D8',
    latex_cmd: '\\begin{hwscore}',
    is_environment: true,
    fields: [
      { name: 'letter_formation', type: 'number', label: 'Letter Formation (0–5)', min: 0, max: 5 },
      { name: 'sizing_consistency', type: 'number', label: 'Sizing Consistency (0–5)', min: 0, max: 5 },
      { name: 'spacing', type: 'number', label: 'Spacing (0–5)', min: 0, max: 5 },
      { name: 'alignment', type: 'number', label: 'Alignment to Line (0–5)', min: 0, max: 5 },
      { name: 'pen_pressure', type: 'number', label: 'Pen Pressure (0–5)', min: 0, max: 5 },
      { name: 'neatness', type: 'number', label: 'Neatness (0–5)', min: 0, max: 5 },
      { name: 'overall', type: 'number', label: 'Overall (0–5)', min: 0, max: 5 },
      { name: 'notes', type: 'textarea', label: 'Notes' },
    ],
  },

  // ── ADMINISTRATIVE ───────────────────────────────────────────────────────────
  teacher_mark: {
    label: 'Teacher Mark',
    colour: '#78909C',
    latex_cmd: '\\teacher_mark',
    fields: [
      { name: 'mark_type', type: 'select', label: 'Mark type', options: ['tick', 'cross', 'half_tick', 'circle', 'underline', 'wavy_underline'] },
      { name: 'ink_colour', type: 'select', label: 'Ink colour', options: ['red', 'blue', 'black'] },
      { name: 'ref_box_id', type: 'text', label: 'Box ID this mark refers to' },
    ],
  },
  teacher_score: {
    label: 'Teacher Score',
    colour: '#78909C',
    latex_cmd: '\\teacher_score',
    fields: [
      { name: 'score_type', type: 'select', label: 'Score type', options: ['partial', 'total', 'carry_forward'] },
      { name: 'raw_text', type: 'text', label: 'As written (e.g. 4/6)' },
      { name: 'value', type: 'number', label: 'Numeric value', min: 0 },
      { name: 'max', type: 'number', label: 'Max marks', min: 0 },
      { name: 'ref_q', type: 'text', label: 'Question reference' },
    ],
  },
  teacher_comment: {
    label: 'Teacher Comment',
    colour: '#607D8B',
    latex_cmd: '\\teacher_comment',
    fields: [
      { name: 'sentiment', type: 'select', label: 'Sentiment', options: ['positive', 'negative', 'neutral'] },
      { name: 'ink_colour', type: 'select', label: 'Ink colour', options: ['red', 'blue', 'black'] },
      { name: 'content', type: 'textarea', label: 'Comment text', required: true },
    ],
  },
  stamp_circular: {
    label: 'Circular Stamp',
    colour: '#90A4AE',
    latex_cmd: '\\stamp[type=circular]',
    fields: [
      { name: 'outer_text', type: 'text', label: 'Outer ring text' },
      { name: 'middle_text', type: 'text', label: 'Middle ring text' },
      { name: 'inner_text', type: 'text', label: 'Inner text' },
      { name: 'center_text', type: 'text', label: 'Center text' },
    ],
  },
  rough: {
    label: 'Rough Work',
    colour: '#BDBDBD',
    latex_cmd: '\\begin{rough}',
    is_environment: true,
    fields: [
      { name: 'content', type: 'textarea', label: 'Transcribe if readable' },
    ],
  },
  metadata: {
    label: 'Metadata',
    colour: '#9E9E9E',
    latex_cmd: '\\begin{metadata}',
    is_environment: true,
    fields: [
      { name: 'question_number', type: 'text', label: 'Question number' },
      { name: 'page_number', type: 'text', label: 'Page number' },
      { name: 'roll_number', type: 'text', label: 'Roll number (will be redacted in output)' },
    ],
  },

  // ── WRAPPERS ─────────────────────────────────────────────────────────────────
  answer: {
    label: 'Answer Block',
    colour: '#546E7A',
    latex_cmd: '\\begin{answer}',
    is_environment: true,
    fields: [
      { name: 'question_id', type: 'text', label: 'Question ID (e.g. q1, q3b)', required: true },
      { name: 'attempt', type: 'number', label: 'Attempt number (if multiple attempts)', min: 1 },
      { name: 'cancelled', type: 'boolean', label: 'This attempt is cancelled' },
      { name: 'misplaced', type: 'boolean', label: 'Misplaced (answered in wrong slot)' },
      { name: 'intended_q', type: 'text', label: 'Intended question ID (if misplaced)' },
      { name: 'blank', type: 'boolean', label: 'Blank answer' },
    ],
  },
  spread: {
    label: 'Double-page Spread',
    colour: '#37474F',
    latex_cmd: '\\begin{spread}',
    is_environment: true,
    fields: [
      { name: 'spine_x', type: 'number', label: 'Spine x-position (0.0–1.0 fraction of image width)', min: 0, max: 1 },
    ],
  },
};

// Groups for the TagDropdown UI
export const TAG_GROUPS = {
  TEXT: ['text', 'line', 'heading', 'paragraph'],
  CORRECTIONS: ['sout', 'scribble', 'overwrite', 'insert', 'underline', 'circle', 'illegible', 'overlap'],
  CONTINUATIONS: ['arrow_start', 'arrow_target', 'page_start', 'page_target', 'marginnote'],
  MATH: ['math_inline', 'math_block', 'ce'],
  STRUCTURE: ['tabular', 'enumerate', 'itemize'],
  DOCUMENT: ['formalletter', 'letter_informal', 'notice', 'application'],
  VISUAL: ['graph', 'map', 'diagram', 'flowchart'],
  LANGUAGE: ['prosody_kannada', 'hwscore'],
  ADMINISTRATIVE: ['teacher_mark', 'teacher_score', 'teacher_comment', 'stamp_circular', 'rough', 'metadata'],
  WRAPPERS: ['answer', 'spread'],
};

export function getTagColour(tagType) {
  return TAG_SCHEMAS[tagType]?.colour || '#aaaaaa';
}
