import { TAG_SCHEMAS } from '../tags/tagSchemas.js';

const S = {
  root: { fontSize: '13px' },
  header: {
    padding: '8px 12px', fontWeight: '700', fontSize: '12px',
    color: '#555', borderBottom: '1px solid #eee', backgroundColor: '#fafafa',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  empty: { padding: '16px 12px', color: '#aaa', fontSize: '12px' },
  item: {
    padding: '6px 12px', borderBottom: '1px solid #f0f0f0',
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
  },
  swatch: { width: '10px', height: '10px', borderRadius: '2px', flexShrink: 0 },
  itemMain: { flex: 1, minWidth: 0 },
  itemTag: { fontSize: '12px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  itemPreview: { fontSize: '11px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '1px' },
  order: { fontSize: '11px', color: '#bbb', flexShrink: 0 },
  chip: (colour) => ({
    fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '10px',
    backgroundColor: colour + '22', color: colour, border: `1px solid ${colour}55`,
    whiteSpace: 'nowrap', flexShrink: 0,
  }),
  deleteBtn: {
    padding: '2px 7px', fontSize: '11px', color: '#F44336',
    border: '1px solid #F44336', borderRadius: '3px', cursor: 'pointer',
    backgroundColor: 'transparent', flexShrink: 0, opacity: 0.6,
  },
  nestIndicator: { fontSize: '10px', color: '#FF9800', marginRight: '2px', flexShrink: 0 },
};

function BoxItem({ box, depth, selectedBoxId, onSelect, onDelete }) {
  const schema = TAG_SCHEMAS[box.tag_category];
  const colour = schema?.colour || '#111111';
  const isSelected = box.id === selectedBoxId;

  return (
    <div
      style={{
        ...S.item,
        paddingLeft: `${12 + depth * 16}px`,
        backgroundColor: isSelected ? '#e3f2fd' : depth > 0 ? '#fafffe' : 'transparent',
        borderLeft: isSelected ? `3px solid ${colour}` : depth > 0 ? '3px solid #FF980033' : '3px solid transparent',
      }}
      onClick={() => onSelect(box.id)}
    >
      {depth > 0 && <span style={S.nestIndicator}>↳</span>}
      <span style={{ ...S.swatch, backgroundColor: colour }} />
      <div style={S.itemMain}>
        <div style={S.itemTag}>
          {box.tag_category ? (schema?.label || box.tag_category) : <span style={{ color: '#bbb' }}>untagged</span>}
        </div>
        {box.content_text && (
          <div style={S.itemPreview}>{box.content_text.substring(0, 50)}</div>
        )}
      </div>
      {isSelected && box.tag_category && (
        <span style={S.chip(colour)}>
          {schema?.label || box.tag_category}
          {box.reading_order != null ? ` #${box.reading_order}` : ''}
        </span>
      )}
      {!isSelected && (
        <span style={S.order}>#{box.reading_order ?? '—'}</span>
      )}
      <button
        style={S.deleteBtn}
        onClick={(e) => { e.stopPropagation(); onDelete(box.id); }}
        title="Delete box"
      >✕</button>
    </div>
  );
}

function renderTree(boxes, parentId, depth, selectedBoxId, onSelect, onDelete) {
  const children = boxes
    .filter((b) => (b.parent_box_id ?? null) === (parentId ?? null))
    .sort((a, b) => {
      if (a.reading_order == null && b.reading_order == null) return a.id - b.id;
      if (a.reading_order == null) return 1;
      if (b.reading_order == null) return -1;
      return a.reading_order - b.reading_order;
    });

  return children.flatMap((box) => [
    <BoxItem
      key={box.id}
      box={box}
      depth={depth}
      selectedBoxId={selectedBoxId}
      onSelect={onSelect}
      onDelete={onDelete}
    />,
    ...renderTree(boxes, box.id, depth + 1, selectedBoxId, onSelect, onDelete),
  ]);
}

export default function BoxList({ boxes, selectedBoxId, onSelect, onDelete }) {
  const topLevelCount = boxes.filter((b) => !b.parent_box_id).length;
  const totalCount = boxes.length;

  return (
    <div style={S.root}>
      <div style={S.header}>
        <span>Boxes</span>
        <span style={{ fontWeight: '400', color: '#aaa' }}>
          {topLevelCount === totalCount ? totalCount : `${topLevelCount} (+${totalCount - topLevelCount} nested)`}
        </span>
      </div>
      {boxes.length === 0 && (
        <div style={S.empty}>Draw rectangles on the image to create boxes.</div>
      )}
      {renderTree(boxes, null, 0, selectedBoxId, onSelect, onDelete)}
    </div>
  );
}
