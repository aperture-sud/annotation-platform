import { useState } from 'react';
import { TAG_GROUPS, TAG_SCHEMAS } from '../tags/tagSchemas.js';

const styles = {
  wrapper: { fontSize: '13px' },
  heading: { fontWeight: '700', fontSize: '13px', marginBottom: '8px', color: '#333' },
  group: { marginBottom: '10px' },
  groupLabel: { fontSize: '10px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: '4px' },
  tagBtn: {
    padding: '3px 9px', fontSize: '12px', border: '1px solid #ddd',
    borderRadius: '3px', cursor: 'pointer', backgroundColor: '#fafafa',
    color: '#333', display: 'inline-flex', alignItems: 'center', gap: '4px',
  },
  swatch: { width: '8px', height: '8px', borderRadius: '2px', display: 'inline-block', flexShrink: 0 },
  cancelBtn: {
    marginTop: '8px', padding: '4px 10px', fontSize: '12px',
    border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer',
    backgroundColor: '#f5f5f5', color: '#555',
  },
};

export default function TagDropdown({ onPick, onCancel }) {
  const [hovered, setHovered] = useState(null);

  return (
    <div style={styles.wrapper}>
      <div style={styles.heading}>Choose tag type</div>
      {Object.entries(TAG_GROUPS).map(([group, tags]) => (
        <div key={group} style={styles.group}>
          <div style={styles.groupLabel}>{group}</div>
          <div style={styles.tagRow}>
            {tags.map((tag) => {
              const schema = TAG_SCHEMAS[tag];
              if (!schema) return null;
              return (
                <button
                  key={tag}
                  style={{
                    ...styles.tagBtn,
                    backgroundColor: hovered === tag ? schema.colour + '22' : '#fafafa',
                    borderColor: hovered === tag ? schema.colour : '#ddd',
                  }}
                  onMouseEnter={() => setHovered(tag)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => onPick(tag)}
                >
                  <span style={{ ...styles.swatch, backgroundColor: schema.colour }} />
                  {schema.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
    </div>
  );
}
