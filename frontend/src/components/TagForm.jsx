import { useState, useEffect, useRef } from 'react';
import { TAG_SCHEMAS } from '../tags/tagSchemas.js';
import { updateBox } from '../api/client.js';
import getCaretCoordinates from 'textarea-caret';

const S = {
  form: { padding: '12px', fontSize: '13px' },
  tagHeader: {
    display: 'flex', alignItems: 'center', gap: '8px',
    marginBottom: '12px',
  },
  swatch: { width: '12px', height: '12px', borderRadius: '3px', flexShrink: 0 },
  tagLabel: { fontWeight: '700', fontSize: '14px' },
  metaRow: { display: 'flex', gap: '8px', marginBottom: '10px' },
  metaField: { flex: 1 },
  label: { display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' },
  input: { width: '100%', padding: '5px 7px', fontSize: '13px', border: '1px solid #ccc', borderRadius: '3px', boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '5px 7px', fontSize: '13px', border: '1px solid #ccc', borderRadius: '3px', boxSizing: 'border-box', resize: 'vertical', minHeight: '72px', fontFamily: 'monospace' },
  select: { width: '100%', padding: '5px 7px', fontSize: '13px', border: '1px solid #ccc', borderRadius: '3px', boxSizing: 'border-box', backgroundColor: '#fff' },
  fieldWrapper: { marginBottom: '8px' },
  checkRow: { display: 'flex', alignItems: 'center', gap: '6px' },
  saveBtn: {
    width: '100%', padding: '8px', backgroundColor: '#2196F3', color: '#fff',
    border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px',
    fontWeight: '600', marginTop: '4px',
  },
  illegalBtn: {
    padding: '5px 10px', fontSize: '12px', border: '1px solid #F44336',
    color: '#F44336', backgroundColor: '#fff0f0', borderRadius: '3px',
    cursor: 'pointer', marginBottom: '8px',
  },
  saved: { color: '#4CAF50', fontSize: '12px', marginTop: '4px', textAlign: 'center' },
};

function KannadaTextarea({ value, onChange, style, placeholder }) {
  const taRef = useRef(null);
  const [suggestions, setSuggestions] = useState([]);
  const [popupPos, setPopupPos] = useState(null);
  const wordRangeRef = useRef(null);
  const pendingCursor = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (pendingCursor.current !== null && taRef.current) {
      taRef.current.setSelectionRange(pendingCursor.current, pendingCursor.current);
      pendingCursor.current = null;
    }
  });

  function getCurrentWord(ta) {
    const cursor = ta.selectionStart;
    const text = ta.value;
    let start = cursor;
    while (start > 0 && text[start - 1] !== ' ' && text[start - 1] !== '\n') start--;
    return { start, end: cursor, word: text.slice(start, cursor) };
  }

  function applyChoice(suggestion) {
    const range = wordRangeRef.current;
    if (!range) return;
    const text = taRef.current.value;
    const newVal = text.slice(0, range.start) + suggestion + text.slice(range.end);
    pendingCursor.current = range.start + suggestion.length;
    onChange(newVal);
    setSuggestions([]);
    setPopupPos(null);
    wordRangeRef.current = null;
  }

  async function fetchSuggestions(word, range) {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    try {
      const res = await fetch(
        `https://inputtools.google.com/request?text=${encodeURIComponent(word)}&itc=kn-t-i0-und&num=5&cp=0&cs=1&ie=utf-8&oe=utf-8`,
        { signal: abortRef.current.signal }
      );
      const data = await res.json();
      if (data[0] === 'SUCCESS' && data[1]?.[0]?.[1]?.length) {
        const list = data[1][0][1];
        const ta = taRef.current;
        const coords = getCaretCoordinates(ta, range.start);
        const rect = ta.getBoundingClientRect();
        setSuggestions(list);
        setPopupPos({ left: rect.left + coords.left, top: rect.top + coords.top + coords.height + 2 });
        wordRangeRef.current = range;
      } else {
        setSuggestions([]);
      }
    } catch (err) {
      if (err.name !== 'AbortError') setSuggestions([]);
    }
  }

  function handleChange(e) {
    onChange(e.target.value);
    const range = getCurrentWord(e.target);
    if (range.word && !/[ಀ-೿]/.test(range.word)) {
      fetchSuggestions(range.word, range);
    } else {
      setSuggestions([]);
    }
  }

  function handleKeyDown(e) {
    if (!suggestions.length) return;
    if (e.key === 'Escape') { e.preventDefault(); setSuggestions([]); return; }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const chosen = suggestions[0];
      const range = wordRangeRef.current;
      const text = taRef.current.value;
      const sep = e.key === ' ' ? ' ' : '\n';
      const newVal = text.slice(0, range.start) + chosen + sep + text.slice(range.end);
      pendingCursor.current = range.start + chosen.length + 1;
      onChange(newVal);
      setSuggestions([]);
      setPopupPos(null);
      wordRangeRef.current = null;
    }
  }

  return (
    <>
      <textarea
        ref={taRef}
        style={style}
        value={value ?? ''}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setSuggestions([]), 150)}
        placeholder={placeholder}
      />
      {suggestions.length > 0 && popupPos && (
        <div style={{
          position: 'fixed', left: popupPos.left, top: popupPos.top,
          backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)', zIndex: 9999,
          display: 'flex', gap: '4px', padding: '4px',
        }}>
          {suggestions.map((s, i) => (
            <button
              key={i}
              onMouseDown={(e) => { e.preventDefault(); applyChoice(s); }}
              style={{
                padding: '4px 10px', fontSize: '14px', cursor: 'pointer', borderRadius: '3px',
                border: i === 0 ? '1px solid #9C27B0' : '1px solid #eee',
                backgroundColor: i === 0 ? '#f3e5f5' : '#fff',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function FieldRenderer({ field, value, onChange, transliterate }) {
  if (field.type === 'textarea') {
    return (
      <div style={S.fieldWrapper}>
        <label style={S.label}>{field.label}{field.required ? ' *' : ''}</label>
        {transliterate ? (
          <KannadaTextarea
            value={value ?? ''}
            onChange={onChange}
            style={S.textarea}
            placeholder={field.required ? 'Required' : ''}
          />
        ) : (
          <textarea
            style={S.textarea}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.required ? 'Required' : ''}
          />
        )}
      </div>
    );
  }
  if (field.type === 'text') {
    return (
      <div style={S.fieldWrapper}>
        <label style={S.label}>{field.label}</label>
        <input type="text" style={S.input} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  if (field.type === 'number') {
    return (
      <div style={S.fieldWrapper}>
        <label style={S.label}>{field.label}</label>
        <input
          type="number" style={S.input} value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          min={field.min} max={field.max}
        />
      </div>
    );
  }
  if (field.type === 'select') {
    return (
      <div style={S.fieldWrapper}>
        <label style={S.label}>{field.label}</label>
        <select style={S.select} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">— select —</option>
          {(field.options || []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }
  if (field.type === 'boolean') {
    return (
      <div style={{ ...S.fieldWrapper, ...S.checkRow }}>
        <input
          type="checkbox" checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          id={`chk-${field.name}`}
        />
        <label htmlFor={`chk-${field.name}`} style={{ fontSize: '13px', cursor: 'pointer' }}>{field.label}</label>
      </div>
    );
  }
  return null;
}

export default function TagForm({ box, onUpdate }) {
  const schema = TAG_SCHEMAS[box?.tag_category];
  const [formData, setFormData] = useState({});
  const [readingOrder, setReadingOrder] = useState('');
  const [confidence, setConfidence] = useState('high');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [transliterate, setTransliterate] = useState(false);

  // Reset form data when box changes
  useEffect(() => {
    if (!box) return;
    try {
      setFormData(box.tag_data ? JSON.parse(box.tag_data) : {});
    } catch {
      setFormData({});
    }
    setConfidence(box.confidence || 'high');
    setSavedMsg(false);
  }, [box?.id]);

  // Keep reading order in sync whenever it's assigned (e.g. auto-assigned after creation)
  useEffect(() => {
    if (box?.reading_order != null) {
      setReadingOrder(box.reading_order);
    }
  }, [box?.reading_order]);

  if (!box || !schema) {
    return <div style={{ padding: '12px', color: '#888', fontSize: '13px' }}>Unknown tag: {box?.tag_category}</div>;
  }

  function setField(name, value) {
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Derive content_text from the content/source_text field
      const contentField = schema.fields.find((f) => ['content', 'source_text'].includes(f.name));
      const content = contentField ? (formData[contentField.name] || '') : '';

      const updated = await updateBox(box.id, {
        tag_category: box.tag_category,
        tag_data: JSON.stringify(formData),
        content_text: content,
        reading_order: readingOrder !== '' ? Number(readingOrder) : (box.reading_order ?? null),
        confidence,
      });
      onUpdate(updated);
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 1500);
    } catch (e) {
      console.error('Save failed', e);
      alert('Failed to save. Check the backend.');
    } finally {
      setSaving(false);
    }
  }

  const hasContentField = schema.fields.some((f) => f.name === 'content' && f.type === 'textarea');

  return (
    <div style={S.form}>
      {/* Tag header */}
      <div style={S.tagHeader}>
        <span style={{ ...S.swatch, backgroundColor: schema.colour }} />
        <span style={S.tagLabel}>{schema.label}</span>
        <button
          onClick={() => setTransliterate((v) => !v)}
          style={{
            marginLeft: 'auto', padding: '2px 8px', fontSize: '11px', borderRadius: '3px',
            cursor: 'pointer', border: '1px solid',
            borderColor: transliterate ? '#9C27B0' : '#ccc',
            color: transliterate ? '#9C27B0' : '#888',
            backgroundColor: transliterate ? '#f3e5f5' : '#fff',
            fontWeight: transliterate ? '600' : '400',
          }}
        >
          Kannada
        </button>
      </div>

      {/* Reading order + confidence */}
      <div style={S.metaRow}>
        <div style={S.metaField}>
          <label style={S.label}>Reading order</label>
          <input
            type="number" style={S.input}
            value={readingOrder}
            onChange={(e) => setReadingOrder(e.target.value)}
            min={1}
          />
        </div>
        <div style={S.metaField}>
          <label style={S.label}>Confidence</label>
          <select style={S.select} value={confidence} onChange={(e) => setConfidence(e.target.value)}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Schema-driven fields */}
      {schema.fields.map((field) => (
        <FieldRenderer
          key={field.name}
          field={field}
          value={formData[field.name] ?? (field.type === 'boolean' ? false : '')}
          onChange={(v) => setField(field.name, v)}
          transliterate={transliterate}
        />
      ))}

      {/* Illegible shortcut for text content tags */}
      {hasContentField && (
        <button
          style={S.illegalBtn}
          onClick={() => setField('content', '[illegible]')}
        >
          Mark as Illegible
        </button>
      )}

      <button style={S.saveBtn} onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      {savedMsg && <div style={S.saved}>Saved ✓</div>}
    </div>
  );
}
