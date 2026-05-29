import { useState, useMemo } from 'react';

function insertAtCursor(text) {
  const el = document.activeElement;
  if (!el || (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT')) return;
  const start = el.selectionStart ?? el.value.length;
  const end   = el.selectionEnd   ?? el.value.length;
  const newVal = el.value.slice(0, start) + text + el.value.slice(end);
  const proto  = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) { setter.call(el, newVal); el.dispatchEvent(new Event('input', { bubbles: true })); }
  requestAnimationFrame(() => { const pos = start + text.length; el.setSelectionRange(pos, pos); el.focus(); });
}

// ─── CHEMISTRY ───────────────────────────────────────────────────────────────
const CHEMISTRY = [
  {
    group: 'Common Compounds',
    items: [
      { label: 'H₂O',       insert: 'H_2O' },
      { label: 'CO₂',       insert: 'CO_2' },
      { label: 'O₂',        insert: 'O_2' },
      { label: 'H₂',        insert: 'H_2' },
      { label: 'N₂',        insert: 'N_2' },
      { label: 'NH₃',       insert: 'NH_3' },
      { label: 'CH₄',       insert: 'CH_4' },
      { label: 'CO',        insert: 'CO' },
      { label: 'SO₂',       insert: 'SO_2' },
      { label: 'SO₃',       insert: 'SO_3' },
      { label: 'NO',        insert: 'NO' },
      { label: 'NO₂',       insert: 'NO_2' },
      { label: 'N₂O',       insert: 'N_2O' },
      { label: 'O₃',        insert: 'O_3' },
      { label: 'H₂O₂',     insert: 'H_2O_2' },
      { label: 'Cl₂',       insert: 'Cl_2' },
      { label: 'Br₂',       insert: 'Br_2' },
      { label: 'I₂',        insert: 'I_2' },
      { label: 'H₂S',       insert: 'H_2S' },
      { label: 'HF',        insert: 'HF' },
      { label: 'P₄',        insert: 'P_4' },
      { label: 'S₈',        insert: 'S_8' },
      { label: 'SiO₂',      insert: 'SiO_2' },
    ],
  },
  {
    group: 'Acids',
    items: [
      { label: 'HCl',       insert: 'HCl' },
      { label: 'H₂SO₄',    insert: 'H_2SO_4' },
      { label: 'HNO₃',     insert: 'HNO_3' },
      { label: 'H₃PO₄',    insert: 'H_3PO_4' },
      { label: 'H₂CO₃',    insert: 'H_2CO_3' },
      { label: 'H₂SO₃',    insert: 'H_2SO_3' },
      { label: 'HNO₂',     insert: 'HNO_2' },
      { label: 'HCN',       insert: 'HCN' },
      { label: 'HCOOH',     insert: 'HCOOH' },
      { label: 'CH₃COOH',  insert: 'CH_3COOH' },
      { label: '(COOH)₂',  insert: '(COOH)_2' },
      { label: 'C₃H₆O₃',   insert: 'C_3H_6O_3' },
      { label: 'C₆H₈O₇',   insert: 'C_6H_8O_7' },
    ],
  },
  {
    group: 'Bases',
    items: [
      { label: 'NaOH',      insert: 'NaOH' },
      { label: 'KOH',       insert: 'KOH' },
      { label: 'Ca(OH)₂',  insert: 'Ca(OH)_2' },
      { label: 'Mg(OH)₂',  insert: 'Mg(OH)_2' },
      { label: 'Al(OH)₃',  insert: 'Al(OH)_3' },
      { label: 'Fe(OH)₂',  insert: 'Fe(OH)_2' },
      { label: 'Fe(OH)₃',  insert: 'Fe(OH)_3' },
      { label: 'Cu(OH)₂',  insert: 'Cu(OH)_2' },
      { label: 'Zn(OH)₂',  insert: 'Zn(OH)_2' },
      { label: 'NH₄OH',    insert: 'NH_4OH' },
      { label: 'Ba(OH)₂',  insert: 'Ba(OH)_2' },
    ],
  },
  {
    group: 'Salts & Oxides',
    items: [
      { label: 'NaCl',       insert: 'NaCl' },
      { label: 'KCl',        insert: 'KCl' },
      { label: 'CaCO₃',     insert: 'CaCO_3' },
      { label: 'Na₂CO₃',    insert: 'Na_2CO_3' },
      { label: 'NaHCO₃',    insert: 'NaHCO_3' },
      { label: 'CaO',        insert: 'CaO' },
      { label: 'MgO',        insert: 'MgO' },
      { label: 'ZnO',        insert: 'ZnO' },
      { label: 'CuO',        insert: 'CuO' },
      { label: 'Na₂O',       insert: 'Na_2O' },
      { label: 'K₂O',        insert: 'K_2O' },
      { label: 'Al₂O₃',     insert: 'Al_2O_3' },
      { label: 'Fe₂O₃',     insert: 'Fe_2O_3' },
      { label: 'Fe₃O₄',     insert: 'Fe_3O_4' },
      { label: 'FeO',        insert: 'FeO' },
      { label: 'P₄O₁₀',     insert: 'P_4O_{10}' },
      { label: 'CuSO₄',     insert: 'CuSO_4' },
      { label: 'ZnSO₄',     insert: 'ZnSO_4' },
      { label: 'FeSO₄',     insert: 'FeSO_4' },
      { label: 'Fe₂(SO₄)₃', insert: 'Fe_2(SO_4)_3' },
      { label: 'MgSO₄',     insert: 'MgSO_4' },
      { label: 'Na₂SO₄',    insert: 'Na_2SO_4' },
      { label: 'K₂SO₄',     insert: 'K_2SO_4' },
      { label: 'CaSO₄',     insert: 'CaSO_4' },
      { label: 'KMnO₄',     insert: 'KMnO_4' },
      { label: 'AgNO₃',     insert: 'AgNO_3' },
      { label: 'AgCl',       insert: 'AgCl' },
      { label: 'AgBr',       insert: 'AgBr' },
      { label: 'AgI',        insert: 'AgI' },
      { label: 'BaSO₄',     insert: 'BaSO_4' },
      { label: 'BaCl₂',     insert: 'BaCl_2' },
      { label: 'PbI₂',      insert: 'PbI_2' },
      { label: 'PbS',        insert: 'PbS' },
      { label: 'PbO',        insert: 'PbO' },
      { label: 'KNO₃',      insert: 'KNO_3' },
      { label: 'Ca(NO₃)₂',  insert: 'Ca(NO_3)_2' },
      { label: 'NH₄Cl',     insert: 'NH_4Cl' },
      { label: 'NH₄NO₃',    insert: 'NH_4NO_3' },
      { label: 'K₂Cr₂O₇',   insert: 'K_2Cr_2O_7' },
      { label: 'K₂CrO₄',    insert: 'K_2CrO_4' },
      { label: 'MnO₂',      insert: 'MnO_2' },
      { label: 'SnO₂',      insert: 'SnO_2' },
      { label: 'NiSO₄',     insert: 'NiSO_4' },
    ],
  },
  {
    group: 'Named / Hydrated Salts',
    items: [
      { label: 'CuSO₄·5H₂O',       insert: 'CuSO_4 \\cdot 5H_2O' },
      { label: 'FeSO₄·7H₂O',       insert: 'FeSO_4 \\cdot 7H_2O' },
      { label: 'ZnSO₄·7H₂O',       insert: 'ZnSO_4 \\cdot 7H_2O' },
      { label: 'MgSO₄·7H₂O',       insert: 'MgSO_4 \\cdot 7H_2O' },
      { label: 'CaSO₄·2H₂O',       insert: 'CaSO_4 \\cdot 2H_2O' },
      { label: 'CaSO₄·½H₂O',       insert: 'CaSO_4 \\cdot \\tfrac{1}{2}H_2O' },
      { label: 'Na₂CO₃·10H₂O',     insert: 'Na_2CO_3 \\cdot 10H_2O' },
      { label: 'Na₂B₄O₇·10H₂O',    insert: 'Na_2B_4O_7 \\cdot 10H_2O' },
      { label: 'KAl(SO₄)₂·12H₂O',  insert: 'KAl(SO_4)_2 \\cdot 12H_2O' },
      { label: 'Al₂O₃·2H₂O',       insert: 'Al_2O_3 \\cdot 2H_2O' },
      { label: '2Fe₂O₃·3H₂O',      insert: '2Fe_2O_3 \\cdot 3H_2O' },
      { label: 'CaOCl₂',           insert: 'CaOCl_2' },
      { label: 'Na₂S₂O₃',          insert: 'Na_2S_2O_3' },
      { label: 'Na₃AlF₆',          insert: 'Na_3AlF_6' },
    ],
  },
  {
    group: 'Ions',
    items: [
      { label: 'H⁺',      insert: 'H^+' },
      { label: 'OH⁻',     insert: 'OH^-' },
      { label: 'Na⁺',     insert: 'Na^+' },
      { label: 'K⁺',      insert: 'K^+' },
      { label: 'Ag⁺',     insert: 'Ag^+' },
      { label: 'Ca²⁺',    insert: 'Ca^{2+}' },
      { label: 'Mg²⁺',    insert: 'Mg^{2+}' },
      { label: 'Fe²⁺',    insert: 'Fe^{2+}' },
      { label: 'Fe³⁺',    insert: 'Fe^{3+}' },
      { label: 'Cu²⁺',    insert: 'Cu^{2+}' },
      { label: 'Zn²⁺',    insert: 'Zn^{2+}' },
      { label: 'Al³⁺',    insert: 'Al^{3+}' },
      { label: 'Pb²⁺',    insert: 'Pb^{2+}' },
      { label: 'Hg²⁺',    insert: 'Hg^{2+}' },
      { label: 'Cr³⁺',    insert: 'Cr^{3+}' },
      { label: 'Ni²⁺',    insert: 'Ni^{2+}' },
      { label: 'NH₄⁺',    insert: 'NH_4^+' },
      { label: 'Cl⁻',     insert: 'Cl^-' },
      { label: 'Br⁻',     insert: 'Br^-' },
      { label: 'I⁻',      insert: 'I^-' },
      { label: 'F⁻',      insert: 'F^-' },
      { label: 'O²⁻',     insert: 'O^{2-}' },
      { label: 'S²⁻',     insert: 'S^{2-}' },
      { label: 'N³⁻',     insert: 'N^{3-}' },
      { label: 'SO₄²⁻',   insert: 'SO_4^{2-}' },
      { label: 'CO₃²⁻',   insert: 'CO_3^{2-}' },
      { label: 'NO₃⁻',    insert: 'NO_3^-' },
      { label: 'NO₂⁻',    insert: 'NO_2^-' },
      { label: 'PO₄³⁻',   insert: 'PO_4^{3-}' },
      { label: 'HCO₃⁻',   insert: 'HCO_3^-' },
      { label: 'MnO₄⁻',   insert: 'MnO_4^-' },
      { label: 'Cr₂O₇²⁻', insert: 'Cr_2O_7^{2-}' },
      { label: 'ClO⁻',    insert: 'ClO^-' },
    ],
  },
  {
    group: 'Metal + Oxygen',
    items: [
      { label: '4Na+O₂→2Na₂O',       insert: '4Na + O_2 \\rightarrow 2Na_2O' },
      { label: '4K+O₂→2K₂O',         insert: '4K + O_2 \\rightarrow 2K_2O' },
      { label: '2Ca+O₂→2CaO',         insert: '2Ca + O_2 \\rightarrow 2CaO' },
      { label: '2Mg+O₂→2MgO',         insert: '2Mg + O_2 \\rightarrow 2MgO' },
      { label: '4Al+3O₂→2Al₂O₃',      insert: '4Al + 3O_2 \\rightarrow 2Al_2O_3' },
      { label: '2Zn+O₂→2ZnO',         insert: '2Zn + O_2 \\rightarrow 2ZnO' },
      { label: '3Fe+2O₂→Fe₃O₄',       insert: '3Fe + 2O_2 \\rightarrow Fe_3O_4' },
      { label: '4Fe+3O₂→2Fe₂O₃',      insert: '4Fe + 3O_2 \\rightarrow 2Fe_2O_3' },
      { label: '2Cu+O₂→2CuO',         insert: '2Cu + O_2 \\rightarrow 2CuO' },
      { label: '2Pb+O₂→2PbO',         insert: '2Pb + O_2 \\rightarrow 2PbO' },
      { label: 'S+O₂→SO₂',            insert: 'S + O_2 \\rightarrow SO_2' },
      { label: 'C+O₂→CO₂',            insert: 'C + O_2 \\rightarrow CO_2' },
      { label: '2C+O₂→2CO',           insert: '2C + O_2 \\rightarrow 2CO' },
      { label: 'N₂+O₂→2NO',           insert: 'N_2 + O_2 \\rightarrow 2NO' },
    ],
  },
  {
    group: 'Metal + Water',
    items: [
      { label: '2Na+2H₂O→2NaOH+H₂',  insert: '2Na + 2H_2O \\rightarrow 2NaOH + H_2\\uparrow' },
      { label: '2K+2H₂O→2KOH+H₂',    insert: '2K + 2H_2O \\rightarrow 2KOH + H_2\\uparrow' },
      { label: 'Ca+2H₂O→Ca(OH)₂+H₂', insert: 'Ca + 2H_2O \\rightarrow Ca(OH)_2 + H_2\\uparrow' },
      { label: 'Mg+2H₂O→Mg(OH)₂+H₂', insert: 'Mg + 2H_2O \\rightarrow Mg(OH)_2 + H_2\\uparrow' },
      { label: 'Zn+H₂O→ZnO+H₂',      insert: 'Zn + H_2O \\rightarrow ZnO + H_2\\uparrow' },
      { label: '3Fe+4H₂O→Fe₃O₄+4H₂', insert: '3Fe + 4H_2O \\rightarrow Fe_3O_4 + 4H_2\\uparrow' },
    ],
  },
  {
    group: 'Metal + Acid',
    items: [
      { label: 'Mg+2HCl→MgCl₂+H₂',    insert: 'Mg + 2HCl \\rightarrow MgCl_2 + H_2\\uparrow' },
      { label: 'Zn+2HCl→ZnCl₂+H₂',    insert: 'Zn + 2HCl \\rightarrow ZnCl_2 + H_2\\uparrow' },
      { label: 'Fe+2HCl→FeCl₂+H₂',    insert: 'Fe + 2HCl \\rightarrow FeCl_2 + H_2\\uparrow' },
      { label: '2Al+6HCl→2AlCl₃+3H₂', insert: '2Al + 6HCl \\rightarrow 2AlCl_3 + 3H_2\\uparrow' },
      { label: 'Zn+H₂SO₄→ZnSO₄+H₂',  insert: 'Zn + H_2SO_4 \\rightarrow ZnSO_4 + H_2\\uparrow' },
      { label: 'Fe+H₂SO₄→FeSO₄+H₂',  insert: 'Fe + H_2SO_4 \\rightarrow FeSO_4 + H_2\\uparrow' },
      { label: 'Mg+H₂SO₄→MgSO₄+H₂',  insert: 'Mg + H_2SO_4 \\rightarrow MgSO_4 + H_2\\uparrow' },
    ],
  },
  {
    group: 'Displacement Reactions',
    items: [
      { label: 'Fe+CuSO₄→FeSO₄+Cu',          insert: 'Fe + CuSO_4 \\rightarrow FeSO_4 + Cu' },
      { label: 'Zn+CuSO₄→ZnSO₄+Cu',          insert: 'Zn + CuSO_4 \\rightarrow ZnSO_4 + Cu' },
      { label: 'Cu+2AgNO₃→Cu(NO₃)₂+2Ag',     insert: 'Cu + 2AgNO_3 \\rightarrow Cu(NO_3)_2 + 2Ag' },
      { label: 'Mg+ZnSO₄→MgSO₄+Zn',          insert: 'Mg + ZnSO_4 \\rightarrow MgSO_4 + Zn' },
      { label: 'Zn+FeSO₄→ZnSO₄+Fe',          insert: 'Zn + FeSO_4 \\rightarrow ZnSO_4 + Fe' },
      { label: '2Al+Fe₂O₃→Al₂O₃+2Fe',        insert: '2Al + Fe_2O_3 \\rightarrow Al_2O_3 + 2Fe' },
      { label: 'Cl₂+2KI→2KCl+I₂',            insert: 'Cl_2 + 2KI \\rightarrow 2KCl + I_2' },
    ],
  },
  {
    group: 'Double Displacement / Ppt',
    items: [
      { label: 'AgNO₃+NaCl→AgCl↓+NaNO₃',         insert: 'AgNO_3 + NaCl \\rightarrow AgCl\\downarrow + NaNO_3' },
      { label: 'Na₂SO₄+BaCl₂→BaSO₄↓+2NaCl',      insert: 'Na_2SO_4 + BaCl_2 \\rightarrow BaSO_4\\downarrow + 2NaCl' },
      { label: 'CuSO₄+2NaOH→Cu(OH)₂↓+Na₂SO₄',    insert: 'CuSO_4 + 2NaOH \\rightarrow Cu(OH)_2\\downarrow + Na_2SO_4' },
      { label: 'FeCl₃+3NaOH→Fe(OH)₃↓+3NaCl',     insert: 'FeCl_3 + 3NaOH \\rightarrow Fe(OH)_3\\downarrow + 3NaCl' },
      { label: 'Pb(NO₃)₂+2KI→PbI₂↓+2KNO₃',       insert: 'Pb(NO_3)_2 + 2KI \\rightarrow PbI_2\\downarrow + 2KNO_3' },
      { label: 'CaCl₂+Na₂CO₃→CaCO₃↓+2NaCl',      insert: 'CaCl_2 + Na_2CO_3 \\rightarrow CaCO_3\\downarrow + 2NaCl' },
      { label: 'Na₂S+Pb(NO₃)₂→PbS↓+2NaNO₃',      insert: 'Na_2S + Pb(NO_3)_2 \\rightarrow PbS\\downarrow + 2NaNO_3' },
      { label: 'BaCl₂+H₂SO₄→BaSO₄↓+2HCl',        insert: 'BaCl_2 + H_2SO_4 \\rightarrow BaSO_4\\downarrow + 2HCl' },
      { label: 'ZnSO₄+2NaOH→Zn(OH)₂↓+Na₂SO₄',    insert: 'ZnSO_4 + 2NaOH \\rightarrow Zn(OH)_2\\downarrow + Na_2SO_4' },
      { label: 'Na₂CO₃+2HCl→2NaCl+H₂O+CO₂',      insert: 'Na_2CO_3 + 2HCl \\rightarrow 2NaCl + H_2O + CO_2\\uparrow' },
    ],
  },
  {
    group: 'Decomposition',
    items: [
      { label: '2H₂O→2H₂+O₂',              insert: '2H_2O \\xrightarrow{\\text{electrolysis}} 2H_2\\uparrow + O_2\\uparrow' },
      { label: '2H₂O₂→2H₂O+O₂',            insert: '2H_2O_2 \\xrightarrow{MnO_2} 2H_2O + O_2\\uparrow' },
      { label: 'CaCO₃→CaO+CO₂',            insert: 'CaCO_3 \\xrightarrow{\\Delta} CaO + CO_2\\uparrow' },
      { label: 'ZnCO₃→ZnO+CO₂',            insert: 'ZnCO_3 \\xrightarrow{\\Delta} ZnO + CO_2\\uparrow' },
      { label: '2HgO→2Hg+O₂',              insert: '2HgO \\xrightarrow{\\Delta} 2Hg + O_2\\uparrow' },
      { label: '2KClO₃→2KCl+3O₂',          insert: '2KClO_3 \\xrightarrow{MnO_2,\\Delta} 2KCl + 3O_2\\uparrow' },
      { label: '2KNO₃→2KNO₂+O₂',           insert: '2KNO_3 \\xrightarrow{\\Delta} 2KNO_2 + O_2\\uparrow' },
      { label: '2Pb(NO₃)₂→2PbO+4NO₂+O₂',  insert: '2Pb(NO_3)_2 \\xrightarrow{\\Delta} 2PbO + 4NO_2\\uparrow + O_2\\uparrow' },
      { label: '2AgCl→2Ag+Cl₂',            insert: '2AgCl \\xrightarrow{h\\nu} 2Ag + Cl_2\\uparrow' },
      { label: '2AgBr→2Ag+Br₂',            insert: '2AgBr \\xrightarrow{h\\nu} 2Ag + Br_2\\uparrow' },
      { label: 'NH₄Cl→NH₃+HCl',            insert: 'NH_4Cl \\xrightarrow{\\Delta} NH_3\\uparrow + HCl\\uparrow' },
      { label: 'Fe(OH)₃→Fe₂O₃+H₂O',       insert: '2Fe(OH)_3 \\xrightarrow{\\Delta} Fe_2O_3 + 3H_2O' },
    ],
  },
  {
    group: 'Redox Reactions',
    items: [
      { label: 'CuO+H₂→Cu+H₂O',            insert: 'CuO + H_2 \\xrightarrow{\\Delta} Cu + H_2O' },
      { label: 'Fe₂O₃+3CO→2Fe+3CO₂',       insert: 'Fe_2O_3 + 3CO \\rightarrow 2Fe + 3CO_2' },
      { label: 'Fe₂O₃+3C→2Fe+3CO',         insert: 'Fe_2O_3 + 3C \\rightarrow 2Fe + 3CO\\uparrow' },
      { label: 'ZnO+C→Zn+CO',              insert: 'ZnO + C \\xrightarrow{\\Delta} Zn + CO\\uparrow' },
      { label: 'PbO+C→Pb+CO',              insert: 'PbO + C \\xrightarrow{\\Delta} Pb + CO\\uparrow' },
      { label: 'MnO₂+4HCl→MnCl₂+2H₂O+Cl₂', insert: 'MnO_2 + 4HCl \\rightarrow MnCl_2 + 2H_2O + Cl_2\\uparrow' },
      { label: 'CO₂+C→2CO',               insert: 'CO_2 + C \\xrightarrow{\\Delta} 2CO' },
    ],
  },
  {
    group: 'Combustion',
    items: [
      { label: 'CH₄+2O₂→CO₂+2H₂O',          insert: 'CH_4 + 2O_2 \\rightarrow CO_2 + 2H_2O' },
      { label: 'C₂H₆+7/2O₂→2CO₂+3H₂O',      insert: 'C_2H_6 + \\tfrac{7}{2}O_2 \\rightarrow 2CO_2 + 3H_2O' },
      { label: 'C₃H₈+5O₂→3CO₂+4H₂O',        insert: 'C_3H_8 + 5O_2 \\rightarrow 3CO_2 + 4H_2O' },
      { label: 'C₄H₁₀+13/2O₂→4CO₂+5H₂O',    insert: 'C_4H_{10} + \\tfrac{13}{2}O_2 \\rightarrow 4CO_2 + 5H_2O' },
      { label: 'C₈H₁₈+25/2O₂→8CO₂+9H₂O',    insert: 'C_8H_{18} + \\tfrac{25}{2}O_2 \\rightarrow 8CO_2 + 9H_2O' },
      { label: 'C₂H₅OH+3O₂→2CO₂+3H₂O',      insert: 'C_2H_5OH + 3O_2 \\rightarrow 2CO_2 + 3H_2O' },
      { label: '2C₂H₂+5O₂→4CO₂+2H₂O',       insert: '2C_2H_2 + 5O_2 \\rightarrow 4CO_2 + 2H_2O' },
      { label: '2H₂+O₂→2H₂O',               insert: '2H_2 + O_2 \\rightarrow 2H_2O' },
      { label: 'S+O₂→SO₂',                   insert: 'S + O_2 \\rightarrow SO_2' },
      { label: '2C+O₂→2CO (incomplete)',      insert: '2C + O_2 \\rightarrow 2CO' },
    ],
  },
  {
    group: 'Key Reactions',
    items: [
      { label: 'Photosynthesis',   insert: '6CO_2 + 6H_2O \\xrightarrow{\\text{sunlight}} C_6H_{12}O_6 + 6O_2' },
      { label: 'Respiration',      insert: 'C_6H_{12}O_6 + 6O_2 \\rightarrow 6CO_2 + 6H_2O + \\text{Energy}' },
      { label: 'Fermentation',     insert: 'C_6H_{12}O_6 \\rightarrow 2C_2H_5OH + 2CO_2' },
      { label: 'Haber process',    insert: 'N_2 + 3H_2 \\rightleftharpoons 2NH_3' },
      { label: 'Slaking lime',     insert: 'CaO + H_2O \\rightarrow Ca(OH)_2' },
      { label: 'Thermite',         insert: '2Al + Fe_2O_3 \\rightarrow Al_2O_3 + 2Fe' },
      { label: 'Brine electrolysis', insert: '2NaCl(aq) + 2H_2O \\rightarrow 2NaOH + H_2\\uparrow + Cl_2\\uparrow' },
      { label: 'Rust formation',   insert: '4Fe + 3O_2 + xH_2O \\rightarrow 2Fe_2O_3 \\cdot xH_2O' },
      { label: 'Acid rain SO₃',    insert: 'SO_3 + H_2O \\rightarrow H_2SO_4' },
      { label: 'Acid rain NO₂',    insert: '4NO_2 + 2H_2O + O_2 \\rightarrow 4HNO_3' },
      { label: 'CO₂+H₂O',         insert: 'CO_2 + H_2O \\rightarrow H_2CO_3' },
      { label: 'N₂ fixation',      insert: 'N_2 + 8H^+ + 8e^- \\rightarrow 2NH_3 + H_2' },
      { label: 'Nitrification 1',  insert: '2NH_3 + 3O_2 \\rightarrow 2HNO_2 + 2H_2O' },
      { label: 'Nitrification 2',  insert: '2HNO_2 + O_2 \\rightarrow 2HNO_3' },
      { label: 'Soap making',      insert: '\\text{Fat} + 3NaOH \\rightarrow \\text{Glycerol} + 3\\,\\text{Soap}' },
      { label: 'Esterification',   insert: 'CH_3COOH + C_2H_5OH \\rightleftharpoons CH_3COOC_2H_5 + H_2O' },
      { label: 'H₂ fuel cell',     insert: '2H_2 + O_2 \\rightarrow 2H_2O + \\text{Energy}' },
    ],
  },
  {
    group: 'Organic Compounds',
    items: [
      { label: 'CH₄',         insert: 'CH_4' },
      { label: 'C₂H₆',       insert: 'C_2H_6' },
      { label: 'C₃H₈',       insert: 'C_3H_8' },
      { label: 'C₄H₁₀',      insert: 'C_4H_{10}' },
      { label: 'C₅H₁₂',      insert: 'C_5H_{12}' },
      { label: 'C₈H₁₈',      insert: 'C_8H_{18}' },
      { label: 'CₙH₂ₙ₊₂',    insert: 'C_nH_{2n+2}' },
      { label: 'C₂H₄',       insert: 'C_2H_4' },
      { label: 'C₃H₆',       insert: 'C_3H_6' },
      { label: 'CₙH₂ₙ',      insert: 'C_nH_{2n}' },
      { label: 'C₂H₂',       insert: 'C_2H_2' },
      { label: 'CₙH₂ₙ₋₂',    insert: 'C_nH_{2n-2}' },
      { label: 'C₆H₆',       insert: 'C_6H_6' },
      { label: 'C₇H₈',       insert: 'C_7H_8' },
      { label: 'C₁₀H₈',      insert: 'C_{10}H_8' },
      { label: 'CH₃OH',      insert: 'CH_3OH' },
      { label: 'C₂H₅OH',     insert: 'C_2H_5OH' },
      { label: 'C₃H₇OH',     insert: 'C_3H_7OH' },
      { label: 'C₃H₈O₃',     insert: 'C_3H_8O_3' },
      { label: 'HCHO',       insert: 'HCHO' },
      { label: 'CH₃CHO',     insert: 'CH_3CHO' },
      { label: 'CH₃COCH₃',   insert: 'CH_3COCH_3' },
      { label: 'CH₃COOH',    insert: 'CH_3COOH' },
      { label: 'HCOOH',      insert: 'HCOOH' },
      { label: 'C₆H₁₂O₆',   insert: 'C_6H_{12}O_6' },
      { label: 'C₁₂H₂₂O₁₁', insert: 'C_{12}H_{22}O_{11}' },
      { label: '(C₆H₁₀O₅)ₙ', insert: '(C_6H_{10}O_5)_n' },
      { label: 'CO(NH₂)₂',   insert: 'CO(NH_2)_2' },
      { label: 'CHCl₃',      insert: 'CHCl_3' },
      { label: 'CCl₄',       insert: 'CCl_4' },
    ],
  },
  {
    group: 'Functional Groups',
    items: [
      { label: '–OH',         insert: '-OH' },
      { label: '–CHO',        insert: '-CHO' },
      { label: '–COOH',       insert: '-COOH' },
      { label: '–NH₂',        insert: '-NH_2' },
      { label: '>C=O',        insert: '>C{=}O' },
      { label: '–COO–',       insert: '-COO-' },
      { label: '–Cl',         insert: '-Cl' },
      { label: '–Br',         insert: '-Br' },
      { label: '–NO₂',        insert: '-NO_2' },
      { label: '–CN',         insert: '-CN' },
      { label: 'C=C',         insert: 'C{=}C' },
      { label: 'C≡C',         insert: 'C{\\equiv}C' },
    ],
  },
  {
    group: 'Organic Reactions',
    items: [
      { label: 'C₂H₄+H₂→C₂H₆',             insert: 'C_2H_4 + H_2 \\xrightarrow{Ni} C_2H_6' },
      { label: 'C₂H₄+Br₂→C₂H₄Br₂',          insert: 'C_2H_4 + Br_2 \\rightarrow C_2H_4Br_2' },
      { label: 'CH₄+Cl₂→CH₃Cl+HCl',         insert: 'CH_4 + Cl_2 \\xrightarrow{h\\nu} CH_3Cl + HCl' },
      { label: 'C₂H₅OH→C₂H₄+H₂O',           insert: 'C_2H_5OH \\xrightarrow{H_2SO_4, 170^\\circ C} C_2H_4 + H_2O' },
      { label: 'C₂H₅OH→CH₃COOH',            insert: 'C_2H_5OH \\xrightarrow{\\text{oxidation}} CH_3COOH' },
      { label: 'Glycolysis',                  insert: 'C_6H_{12}O_6 \\rightarrow 2C_3H_4O_3 + 4[H]' },
      { label: 'Lactic acid ferm.',           insert: 'C_6H_{12}O_6 \\rightarrow 2C_3H_6O_3' },
    ],
  },
  {
    group: 'Polymers',
    items: [
      { label: 'Polyethylene',   insert: '-(CH_2-CH_2)_n-' },
      { label: 'PVC',            insert: '-(CH_2-CHCl)_n-' },
      { label: 'Teflon',         insert: '-(CF_2-CF_2)_n-' },
      { label: 'Polystyrene',    insert: '-(CH_2-CHC_6H_5)_n-' },
      { label: 'Nylon-6,6',      insert: '-[CO(CH_2)_4CO-NH(CH_2)_6NH]_n-' },
      { label: 'Cellulose',      insert: '(C_6H_{10}O_5)_n' },
      { label: 'Starch',         insert: '(C_6H_{10}O_5)_n' },
      { label: 'Natural rubber', insert: '(C_5H_8)_n' },
    ],
  },
  {
    group: 'Ore Formulas',
    items: [
      { label: 'Bauxite',        insert: 'Al_2O_3 \\cdot 2H_2O' },
      { label: 'Corundum',       insert: 'Al_2O_3' },
      { label: 'Cryolite',       insert: 'Na_3AlF_6' },
      { label: 'Haematite',      insert: 'Fe_2O_3' },
      { label: 'Magnetite',      insert: 'Fe_3O_4' },
      { label: 'Limonite',       insert: '2Fe_2O_3 \\cdot 3H_2O' },
      { label: 'Iron pyrite',    insert: 'FeS_2' },
      { label: 'Copper glance',  insert: 'Cu_2S' },
      { label: 'Chalcopyrite',   insert: 'CuFeS_2' },
      { label: 'Malachite',      insert: 'Cu(OH)_2 \\cdot CuCO_3' },
      { label: 'Zinc blende',    insert: 'ZnS' },
      { label: 'Calamine',       insert: 'ZnCO_3' },
      { label: 'Galena',         insert: 'PbS' },
      { label: 'Cinnabar',       insert: 'HgS' },
    ],
  },
  {
    group: 'Metallurgy Equations',
    items: [
      { label: 'Blast furnace 1', insert: 'C + O_2 \\rightarrow CO_2' },
      { label: 'Blast furnace 2', insert: 'CO_2 + C \\rightarrow 2CO' },
      { label: 'Blast furnace 3', insert: 'Fe_2O_3 + 3CO \\rightarrow 2Fe + 3CO_2' },
      { label: 'Slag formation',  insert: 'CaO + SiO_2 \\rightarrow CaSiO_3' },
      { label: 'Al extraction',   insert: '2Al_2O_3 \\xrightarrow{\\text{electrolysis}} 4Al + 3O_2' },
      { label: 'Cu smelting',     insert: 'Cu_2O + Cu_2S \\rightarrow 6Cu + SO_2' },
      { label: 'Zn roasting',     insert: '2ZnS + 3O_2 \\rightarrow 2ZnO + 2SO_2' },
      { label: 'Zn reduction',    insert: 'ZnO + C \\rightarrow Zn + CO\\uparrow' },
    ],
  },
  {
    group: 'Electrolysis',
    items: [
      { label: 'Water (cathode)',   insert: '2H^+ + 2e^- \\rightarrow H_2\\uparrow' },
      { label: 'Water (anode)',     insert: '2H_2O \\rightarrow O_2\\uparrow + 4H^+ + 4e^-' },
      { label: 'Cu²⁺ (cathode)',   insert: 'Cu^{2+} + 2e^- \\rightarrow Cu' },
      { label: 'Cu (anode)',        insert: 'Cu \\rightarrow Cu^{2+} + 2e^-' },
      { label: 'Ag plating',        insert: 'Ag^+ + e^- \\rightarrow Ag' },
      { label: 'Zn plating',        insert: 'Zn^{2+} + 2e^- \\rightarrow Zn' },
      { label: 'Cl⁻ (anode)',       insert: '2Cl^- \\rightarrow Cl_2\\uparrow + 2e^-' },
      { label: 'Al (cathode)',      insert: 'Al^{3+} + 3e^- \\rightarrow Al' },
      { label: 'Al (anode)',        insert: '2O^{2-} \\rightarrow O_2 + 4e^-' },
    ],
  },
  {
    group: 'Fertilizers',
    items: [
      { label: 'Urea',        insert: 'CO(NH_2)_2' },
      { label: '(NH₄)₂SO₄',  insert: '(NH_4)_2SO_4' },
      { label: 'NH₄NO₃',     insert: 'NH_4NO_3' },
      { label: 'DAP',         insert: '(NH_4)_2HPO_4' },
      { label: 'Ca(H₂PO₄)₂', insert: 'Ca(H_2PO_4)_2' },
      { label: 'KCl (MOP)',   insert: 'KCl' },
      { label: 'K₂SO₄ (SOP)', insert: 'K_2SO_4' },
      { label: 'Ca(NO₃)₂',   insert: 'Ca(NO_3)_2' },
    ],
  },
  {
    group: 'Environmental Chemistry',
    items: [
      { label: 'Acid rain step 1',  insert: 'S + O_2 \\rightarrow SO_2' },
      { label: 'Acid rain step 2',  insert: '2SO_2 + O_2 \\rightarrow 2SO_3' },
      { label: 'Acid rain step 3',  insert: 'SO_3 + H_2O \\rightarrow H_2SO_4' },
      { label: 'NO → NO₂',         insert: '2NO + O_2 \\rightarrow 2NO_2' },
      { label: 'Ozone breakdown',   insert: 'O_3 + UV \\rightarrow O_2 + O^\\bullet' },
      { label: 'CFC + UV',         insert: 'CCl_2F_2 \\xrightarrow{h\\nu} CCl_2F^\\bullet + Cl^\\bullet' },
      { label: 'Cl destroys O₃',   insert: 'Cl^\\bullet + O_3 \\rightarrow ClO^\\bullet + O_2' },
      { label: 'CO₂ + ocean',      insert: 'CO_2 + H_2O \\rightleftharpoons H_2CO_3' },
      { label: 'Biogas production', insert: 'C_6H_{12}O_6 \\rightarrow 3CH_4 + 3CO_2' },
    ],
  },
  {
    group: 'Biomolecules & Hormones',
    items: [
      { label: 'Glucose',       insert: 'C_6H_{12}O_6' },
      { label: 'Sucrose',       insert: 'C_{12}H_{22}O_{11}' },
      { label: 'ATP',           insert: 'C_{10}H_{16}N_5O_{13}P_3' },
      { label: 'Chlorophyll',   insert: 'C_{55}H_{72}MgN_4O_5' },
      { label: 'Haemoglobin',   insert: 'C_{2952}H_{4664}N_{812}O_{832}S_8Fe_4' },
      { label: 'Testosterone',  insert: 'C_{19}H_{28}O_2' },
      { label: 'Oestrogen',     insert: 'C_{18}H_{24}O_2' },
      { label: 'Adrenaline',    insert: 'C_9H_{13}NO_3' },
      { label: 'Thyroxine',     insert: 'C_{15}H_{11}I_4NO_4' },
      { label: 'Urea (waste)',  insert: 'CO(NH_2)_2' },
      { label: 'Uric acid',     insert: 'C_5H_4N_4O_3' },
      { label: 'Penicillin G',  insert: 'C_{16}H_{18}N_2O_4S' },
    ],
  },
];

// ─── PHYSICS ─────────────────────────────────────────────────────────────────
const PHYSICS = [
  {
    group: 'Motion (Kinematics)',
    items: [
      { label: 'v = u+at',          insert: 'v = u + at' },
      { label: 's = ut+½at²',       insert: 's = ut + \\frac{1}{2}at^2' },
      { label: 'v² = u²+2as',       insert: 'v^2 = u^2 + 2as' },
      { label: 's = (u+v)t/2',      insert: 's = \\frac{(u+v)t}{2}' },
      { label: 'a = (v−u)/t',       insert: 'a = \\frac{v-u}{t}' },
      { label: 'speed = d/t',       insert: '\\text{speed} = \\frac{d}{t}' },
      { label: 'v_avg = Δd/Δt',     insert: 'v_{avg} = \\frac{\\Delta d}{\\Delta t}' },
    ],
  },
  {
    group: 'Circular Motion',
    items: [
      { label: 'v = 2πr/T',         insert: 'v = \\frac{2\\pi r}{T}' },
      { label: 'T = 2πr/v',         insert: 'T = \\frac{2\\pi r}{v}' },
      { label: 'ω = 2π/T',          insert: '\\omega = \\frac{2\\pi}{T}' },
      { label: 'v = ωr',            insert: 'v = \\omega r' },
      { label: 'a_c = v²/r',        insert: 'a_c = \\frac{v^2}{r}' },
      { label: 'f = 1/T',           insert: 'f = \\frac{1}{T}' },
    ],
  },
  {
    group: 'Force & Newton\'s Laws',
    items: [
      { label: 'F = ma',            insert: 'F = ma' },
      { label: 'p = mv',            insert: 'p = mv' },
      { label: 'F = Δp/Δt',         insert: 'F = \\frac{\\Delta p}{\\Delta t}' },
      { label: 'Impulse = FΔt',     insert: 'J = F \\cdot \\Delta t = \\Delta p' },
      { label: 'p₁+p₂ = const',    insert: 'm_1u_1 + m_2u_2 = m_1v_1 + m_2v_2' },
      { label: 'W = mg',            insert: 'W = mg' },
      { label: 'f = μN',            insert: 'f = \\mu N' },
      { label: 'fₛ = μₛN',         insert: 'f_s = \\mu_s N' },
      { label: 'fₖ = μₖN',         insert: 'f_k = \\mu_k N' },
      { label: 'F₁/A₁ = F₂/A₂',   insert: '\\frac{F_1}{A_1} = \\frac{F_2}{A_2}' },
    ],
  },
  {
    group: 'Gravitation',
    items: [
      { label: 'F = Gm₁m₂/r²',     insert: 'F = \\frac{Gm_1m_2}{r^2}' },
      { label: 'g = GM/R²',         insert: 'g = \\frac{GM}{R^2}' },
      { label: 'g = 9.8 m/s²',      insert: 'g = 9.8 \\text{ m/s}^2' },
      { label: "g' = g(1−2h/R)",    insert: "g' = g\\left(1 - \\frac{2h}{R}\\right)" },
      { label: 'vₑ = √(2gR)',       insert: 'v_e = \\sqrt{2gR}' },
      { label: 'vₒ = √(gR)',        insert: 'v_o = \\sqrt{gR}' },
      { label: 'T = 2π√(R/g)',      insert: 'T = 2\\pi\\sqrt{\\frac{R}{g}}' },
      { label: 'G = 6.67×10⁻¹¹',   insert: 'G = 6.67 \\times 10^{-11} \\text{ N·m}^2\\text{/kg}^2' },
    ],
  },
  {
    group: 'Pressure & Fluids',
    items: [
      { label: 'P = F/A',            insert: 'P = \\frac{F}{A}' },
      { label: 'P = ρgh',            insert: 'P = \\rho g h' },
      { label: 'P_total = P₀+ρgh',   insert: 'P_{total} = P_0 + \\rho g h' },
      { label: '1 Pa = 1 N/m²',      insert: '1 \\text{ Pa} = 1 \\text{ N/m}^2' },
      { label: '1 atm = 101325 Pa',  insert: '1 \\text{ atm} = 101325 \\text{ Pa}' },
      { label: 'Pascal\'s law',      insert: 'P_1 = P_2' },
    ],
  },
  {
    group: 'Buoyancy / Archimedes',
    items: [
      { label: 'F_b = ρVg',          insert: 'F_b = \\rho_{liquid} V_{displaced} g' },
      { label: 'Float: ρ_obj < ρ_liq', insert: '\\rho_{object} < \\rho_{liquid} \\Rightarrow \\text{floats}' },
      { label: 'Sink: ρ_obj > ρ_liq', insert: '\\rho_{object} > \\rho_{liquid} \\Rightarrow \\text{sinks}' },
      { label: 'Rel. density',        insert: '\\text{Relative density} = \\frac{\\rho_{substance}}{\\rho_{water}}' },
      { label: 'Apparent weight',     insert: 'W_{apparent} = W - F_b' },
    ],
  },
  {
    group: 'Sound & Waves',
    items: [
      { label: 'v = fλ',             insert: 'v = f\\lambda' },
      { label: 'f = 1/T',            insert: 'f = \\frac{1}{T}' },
      { label: 'T = 1/f',            insert: 'T = \\frac{1}{f}' },
      { label: 'λ = v/f',            insert: '\\lambda = \\frac{v}{f}' },
      { label: 'd = vt/2 (echo)',    insert: 'd = \\frac{v \\cdot t}{2}' },
      { label: 'v_sound ≈ 340 m/s', insert: 'v_{sound} \\approx 340 \\text{ m/s (air)}' },
      { label: 'v_sound = 331+0.6T', insert: 'v_{sound} = 331 + 0.6T \\text{ m/s}' },
    ],
  },
  {
    group: 'Light & Optics',
    items: [
      { label: '∠i = ∠r',            insert: '\\angle i = \\angle r' },
      { label: 'n = c/v',            insert: 'n = \\frac{c}{v}' },
      { label: 'n = sin i/sin r',    insert: 'n = \\frac{\\sin i}{\\sin r}' },
      { label: 'n₁sinθ₁=n₂sinθ₂',   insert: 'n_1 \\sin\\theta_1 = n_2 \\sin\\theta_2' },
      { label: 'n = Real/Apparent',  insert: 'n = \\frac{\\text{Real depth}}{\\text{Apparent depth}}' },
      { label: '1/f = 1/v − 1/u',   insert: '\\frac{1}{f} = \\frac{1}{v} - \\frac{1}{u}' },
      { label: 'm = v/u',            insert: 'm = \\frac{v}{u}' },
      { label: 'm = hᵢ/hₒ',         insert: 'm = \\frac{h_i}{h_o}' },
      { label: 'P = 1/f (D)',        insert: 'P = \\frac{1}{f(\\text{m})} \\text{ D}' },
      { label: 'P = P₁+P₂',         insert: 'P = P_1 + P_2' },
      { label: 'f = R/2',            insert: 'f = \\frac{R}{2}' },
      { label: 'c = 3×10⁸ m/s',     insert: 'c = 3 \\times 10^8 \\text{ m/s}' },
    ],
  },
  {
    group: 'Work, Energy & Power',
    items: [
      { label: 'W = Fs cosθ',        insert: 'W = Fs\\cos\\theta' },
      { label: 'KE = ½mv²',         insert: 'KE = \\frac{1}{2}mv^2' },
      { label: 'PE = mgh',           insert: 'PE = mgh' },
      { label: 'ME = KE + PE',       insert: 'ME = KE + PE = \\text{constant}' },
      { label: 'W = ΔKE',            insert: 'W = \\Delta KE = \\frac{1}{2}mv^2 - \\frac{1}{2}mu^2' },
      { label: 'P = W/t',            insert: 'P = \\frac{W}{t}' },
      { label: 'P = Fv',             insert: 'P = Fv' },
      { label: 'η = W_out/W_in',     insert: '\\eta = \\frac{W_{out}}{W_{in}} \\times 100\\%' },
      { label: 'E = mc²',            insert: 'E = mc^2' },
      { label: '1 kWh = 3.6×10⁶ J', insert: '1 \\text{ kWh} = 3.6 \\times 10^6 \\text{ J}' },
    ],
  },
  {
    group: 'Electricity',
    items: [
      { label: 'V = IR',             insert: 'V = IR' },
      { label: 'R = ρl/A',           insert: 'R = \\frac{\\rho l}{A}' },
      { label: 'R_s = R₁+R₂+…',     insert: 'R_s = R_1 + R_2 + R_3 + \\cdots' },
      { label: '1/R_p = 1/R₁+…',    insert: '\\frac{1}{R_p} = \\frac{1}{R_1} + \\frac{1}{R_2} + \\cdots' },
      { label: 'P = VI',             insert: 'P = VI' },
      { label: 'P = I²R',            insert: 'P = I^2 R' },
      { label: 'P = V²/R',           insert: 'P = \\frac{V^2}{R}' },
      { label: 'Q = It',             insert: 'Q = It' },
      { label: 'H = I²Rt',           insert: 'H = I^2 Rt' },
      { label: 'W = QV = VIt',       insert: 'W = QV = VIt' },
      { label: 'F = kq₁q₂/r²',      insert: 'F = \\frac{kq_1q_2}{r^2}' },
    ],
  },
  {
    group: 'Magnetism',
    items: [
      { label: 'F = BIl sinθ',       insert: 'F = BIl\\sin\\theta' },
      { label: 'F = qvB sinθ',       insert: 'F = qvB\\sin\\theta' },
      { label: 'B (Tesla)',          insert: 'B \\text{ (Tesla, T)}' },
    ],
  },
  {
    group: 'Heat & Thermodynamics',
    items: [
      { label: 'Q = mcΔT',           insert: 'Q = mc\\Delta T' },
      { label: 'Q = mL',             insert: 'Q = mL' },
      { label: 'L_fusion (water)',    insert: 'L_f = 3.34 \\times 10^5 \\text{ J/kg}' },
      { label: 'L_vap (water)',       insert: 'L_v = 22.6 \\times 10^5 \\text{ J/kg}' },
      { label: 'L = L₀(1+αΔT)',      insert: 'L = L_0(1 + \\alpha \\Delta T)' },
      { label: 'β = 2α',             insert: '\\beta = 2\\alpha' },
      { label: 'γ = 3α',             insert: '\\gamma = 3\\alpha' },
      { label: 'K = °C + 273',       insert: 'K = {^\\circ}C + 273' },
      { label: '°C = K − 273',       insert: '{^\\circ}C = K - 273' },
      { label: '°F = 9/5·°C + 32',   insert: '{^\\circ}F = \\frac{9}{5}{^\\circ}C + 32' },
      { label: '°C = 5/9·(°F − 32)', insert: '{^\\circ}C = \\frac{5}{9}({^\\circ}F - 32)' },
    ],
  },
  {
    group: 'Physical Constants',
    items: [
      { label: 'g = 9.8 m/s²',       insert: 'g = 9.8 \\text{ m/s}^2' },
      { label: 'G = 6.67×10⁻¹¹',    insert: 'G = 6.67 \\times 10^{-11} \\text{ N·m}^2/\\text{kg}^2' },
      { label: 'c = 3×10⁸ m/s',      insert: 'c = 3 \\times 10^8 \\text{ m/s}' },
      { label: 'Nₐ = 6.022×10²³',    insert: 'N_A = 6.022 \\times 10^{23} \\text{ mol}^{-1}' },
      { label: 'e = 1.6×10⁻¹⁹ C',   insert: 'e = 1.6 \\times 10^{-19} \\text{ C}' },
      { label: 'mₑ = 9.11×10⁻³¹ kg', insert: 'm_e = 9.11 \\times 10^{-31} \\text{ kg}' },
      { label: 'mₚ = 1.67×10⁻²⁷ kg', insert: 'm_p = 1.67 \\times 10^{-27} \\text{ kg}' },
      { label: '1 u = 1.66×10⁻²⁷ kg', insert: '1 u = 1.66 \\times 10^{-27} \\text{ kg}' },
      { label: 'k = 9×10⁹ N·m²/C²', insert: 'k = 9 \\times 10^9 \\text{ N·m}^2/\\text{C}^2' },
      { label: '1 AU = 1.5×10¹¹ m',  insert: '1 \\text{ AU} = 1.496 \\times 10^{11} \\text{ m}' },
      { label: '1 ly = 9.46×10¹⁵ m', insert: '1 \\text{ ly} = 9.461 \\times 10^{15} \\text{ m}' },
    ],
  },
];

// ─── MATH ────────────────────────────────────────────────────────────────────
const MATH = [
  {
    group: 'Algebra — Identities',
    items: [
      { label: '(a+b)²',            insert: '(a+b)^2 = a^2 + 2ab + b^2' },
      { label: '(a−b)²',            insert: '(a-b)^2 = a^2 - 2ab + b^2' },
      { label: 'a²−b²',             insert: 'a^2 - b^2 = (a+b)(a-b)' },
      { label: '(a+b+c)²',          insert: '(a+b+c)^2 = a^2+b^2+c^2+2ab+2bc+2ca' },
      { label: '(a+b)³',            insert: '(a+b)^3 = a^3 + 3a^2b + 3ab^2 + b^3' },
      { label: '(a−b)³',            insert: '(a-b)^3 = a^3 - 3a^2b + 3ab^2 - b^3' },
      { label: 'a³+b³',             insert: 'a^3 + b^3 = (a+b)(a^2-ab+b^2)' },
      { label: 'a³−b³',             insert: 'a^3 - b^3 = (a-b)(a^2+ab+b^2)' },
    ],
  },
  {
    group: 'Polynomials',
    items: [
      { label: 'Remainder theorem',  insert: 'p(a) = \\text{remainder when } p(x) \\div (x-a)' },
      { label: 'Factor theorem',     insert: '(x-a) \\text{ is factor} \\Leftrightarrow p(a)=0' },
      { label: 'Zeroes of ax²+bx+c', insert: '\\alpha + \\beta = -\\frac{b}{a},\\quad \\alpha\\beta = \\frac{c}{a}' },
      { label: 'Sum of zeroes (cubic)', insert: '\\alpha+\\beta+\\gamma = -\\frac{b}{a}' },
      { label: 'Product of zeroes (cubic)', insert: '\\alpha\\beta\\gamma = -\\frac{d}{a}' },
    ],
  },
  {
    group: 'Linear Equations',
    items: [
      { label: 'ax+by = c',          insert: 'ax + by = c' },
      { label: 'Consistent (unique)', insert: '\\frac{a_1}{a_2} \\ne \\frac{b_1}{b_2}' },
      { label: 'Inconsistent',        insert: '\\frac{a_1}{a_2} = \\frac{b_1}{b_2} \\ne \\frac{c_1}{c_2}' },
      { label: 'Infinite solutions',  insert: '\\frac{a_1}{a_2} = \\frac{b_1}{b_2} = \\frac{c_1}{c_2}' },
      { label: 'Cross multiplication', insert: 'x = \\frac{b_1c_2-b_2c_1}{a_1b_2-a_2b_1},\\quad y = \\frac{c_1a_2-c_2a_1}{a_1b_2-a_2b_1}' },
    ],
  },
  {
    group: 'Quadratic Equations',
    items: [
      { label: 'Quadratic formula',  insert: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
      { label: 'Discriminant D',     insert: 'D = b^2 - 4ac' },
      { label: 'D > 0 → 2 real',    insert: 'D > 0 \\Rightarrow \\text{two distinct real roots}' },
      { label: 'D = 0 → equal',     insert: 'D = 0 \\Rightarrow \\text{two equal real roots}' },
      { label: 'D < 0 → no real',   insert: 'D < 0 \\Rightarrow \\text{no real roots}' },
    ],
  },
  {
    group: 'Arithmetic Progressions',
    items: [
      { label: 'aₙ = a+(n−1)d',     insert: 'a_n = a + (n-1)d' },
      { label: 'Sₙ = n/2[2a+(n-1)d]', insert: 'S_n = \\frac{n}{2}[2a + (n-1)d]' },
      { label: 'Sₙ = n/2(a+l)',     insert: 'S_n = \\frac{n}{2}(a + l)' },
      { label: 'd = aₙ − aₙ₋₁',    insert: 'd = a_n - a_{n-1}' },
      { label: '1+2+…+n',           insert: '1+2+\\cdots+n = \\frac{n(n+1)}{2}' },
    ],
  },
  {
    group: 'Geometric Progressions',
    items: [
      { label: 'aₙ = arⁿ⁻¹',        insert: 'a_n = ar^{n-1}' },
      { label: 'Sₙ = a(rⁿ−1)/(r−1)', insert: 'S_n = \\frac{a(r^n - 1)}{r - 1}, \\quad r \\ne 1' },
      { label: 'S∞ = a/(1−r)',       insert: 'S_\\infty = \\frac{a}{1-r}, \\quad |r| < 1' },
      { label: 'r = aₙ/aₙ₋₁',       insert: 'r = \\frac{a_n}{a_{n-1}}' },
    ],
  },
  {
    group: 'Geometry — Areas',
    items: [
      { label: 'A = ½bh',           insert: 'A = \\frac{1}{2}bh' },
      { label: 'Heron\'s formula',  insert: 'A = \\sqrt{s(s-a)(s-b)(s-c)},\\quad s=\\frac{a+b+c}{2}' },
      { label: 'A = πr²',           insert: 'A = \\pi r^2' },
      { label: 'C = 2πr',           insert: 'C = 2\\pi r' },
      { label: 'Arc length',        insert: 'l = \\frac{\\theta}{360} \\times 2\\pi r' },
      { label: 'Area of sector',    insert: 'A = \\frac{\\theta}{360} \\pi r^2' },
      { label: 'A = lb',            insert: 'A = lb' },
      { label: 'A = s²',            insert: 'A = s^2' },
      { label: 'A = ½d₁d₂',        insert: 'A = \\frac{1}{2}d_1 d_2' },
      { label: 'A = ½(a+b)h',      insert: 'A = \\frac{1}{2}(a+b)h' },
      { label: 'A = bh (||gram)',   insert: 'A = bh' },
    ],
  },
  {
    group: 'Geometry — Volumes & SA',
    items: [
      { label: 'V = a³',            insert: 'V = a^3' },
      { label: 'V = lbh',           insert: 'V = lbh' },
      { label: 'V = πr²h',          insert: 'V = \\pi r^2 h' },
      { label: 'V = ⅓πr²h',        insert: 'V = \\frac{1}{3}\\pi r^2 h' },
      { label: 'V = ⁴⁄₃πr³',       insert: 'V = \\frac{4}{3}\\pi r^3' },
      { label: 'CSA_cyl = 2πrh',    insert: 'CSA = 2\\pi r h' },
      { label: 'TSA_cyl = 2πr(r+h)', insert: 'TSA = 2\\pi r(r+h)' },
      { label: 'CSA_cone = πrl',    insert: 'CSA = \\pi r l' },
      { label: 'TSA_cone = πr(r+l)', insert: 'TSA = \\pi r(r+l)' },
      { label: 'SA_sphere = 4πr²',  insert: 'SA = 4\\pi r^2' },
      { label: 'l² = r²+h²',        insert: 'l^2 = r^2 + h^2' },
      { label: 'TSA_cube = 6a²',    insert: 'TSA = 6a^2' },
      { label: 'TSA_cuboid',        insert: 'TSA = 2(lb+bh+hl)' },
    ],
  },
  {
    group: 'Coordinate Geometry',
    items: [
      { label: 'Distance formula',  insert: 'd = \\sqrt{(x_2-x_1)^2 + (y_2-y_1)^2}' },
      { label: 'Midpoint',          insert: 'M = \\left(\\frac{x_1+x_2}{2},\\ \\frac{y_1+y_2}{2}\\right)' },
      { label: 'Section formula',   insert: 'P = \\left(\\frac{mx_2+nx_1}{m+n},\\ \\frac{my_2+ny_1}{m+n}\\right)' },
      { label: 'Slope m = Δy/Δx',  insert: 'm = \\frac{y_2-y_1}{x_2-x_1}' },
      { label: 'y = mx+c',          insert: 'y = mx + c' },
      { label: 'Area of △ (coords)', insert: 'A = \\frac{1}{2}|x_1(y_2-y_3)+x_2(y_3-y_1)+x_3(y_1-y_2)|' },
      { label: 'Collinear points',  insert: 'x_1(y_2-y_3)+x_2(y_3-y_1)+x_3(y_1-y_2) = 0' },
    ],
  },
  {
    group: 'Pythagoras',
    items: [
      { label: 'a²+b² = c²',        insert: 'a^2 + b^2 = c^2' },
      { label: '3-4-5 triple',      insert: '3^2 + 4^2 = 5^2' },
      { label: '5-12-13 triple',    insert: '5^2 + 12^2 = 13^2' },
      { label: '8-15-17 triple',    insert: '8^2 + 15^2 = 17^2' },
    ],
  },
  {
    group: 'Trigonometry — Ratios',
    items: [
      { label: 'sinθ = O/H',        insert: '\\sin\\theta = \\frac{\\text{Opposite}}{\\text{Hypotenuse}}' },
      { label: 'cosθ = A/H',        insert: '\\cos\\theta = \\frac{\\text{Adjacent}}{\\text{Hypotenuse}}' },
      { label: 'tanθ = O/A',        insert: '\\tan\\theta = \\frac{\\text{Opposite}}{\\text{Adjacent}}' },
      { label: 'tanθ = sinθ/cosθ',  insert: '\\tan\\theta = \\frac{\\sin\\theta}{\\cos\\theta}' },
      { label: 'h = d·tanθ',        insert: 'h = d \\cdot \\tan\\theta' },
    ],
  },
  {
    group: 'Trigonometry — Values',
    items: [
      { label: 'sin 0°=0',          insert: '\\sin 0^\\circ = 0' },
      { label: 'sin 30°=½',         insert: '\\sin 30^\\circ = \\frac{1}{2}' },
      { label: 'sin 45°=1/√2',      insert: '\\sin 45^\\circ = \\frac{1}{\\sqrt{2}}' },
      { label: 'sin 60°=√3/2',      insert: '\\sin 60^\\circ = \\frac{\\sqrt{3}}{2}' },
      { label: 'sin 90°=1',         insert: '\\sin 90^\\circ = 1' },
      { label: 'cos 0°=1',          insert: '\\cos 0^\\circ = 1' },
      { label: 'cos 30°=√3/2',      insert: '\\cos 30^\\circ = \\frac{\\sqrt{3}}{2}' },
      { label: 'cos 45°=1/√2',      insert: '\\cos 45^\\circ = \\frac{1}{\\sqrt{2}}' },
      { label: 'cos 60°=½',         insert: '\\cos 60^\\circ = \\frac{1}{2}' },
      { label: 'cos 90°=0',         insert: '\\cos 90^\\circ = 0' },
      { label: 'tan 0°=0',          insert: '\\tan 0^\\circ = 0' },
      { label: 'tan 30°=1/√3',      insert: '\\tan 30^\\circ = \\frac{1}{\\sqrt{3}}' },
      { label: 'tan 45°=1',         insert: '\\tan 45^\\circ = 1' },
      { label: 'tan 60°=√3',        insert: '\\tan 60^\\circ = \\sqrt{3}' },
    ],
  },
  {
    group: 'Trig Identities',
    items: [
      { label: 'sin²+cos²=1',       insert: '\\sin^2\\theta + \\cos^2\\theta = 1' },
      { label: '1+tan²=sec²',       insert: '1 + \\tan^2\\theta = \\sec^2\\theta' },
      { label: '1+cot²=csc²',       insert: '1 + \\cot^2\\theta = \\csc^2\\theta' },
      { label: 'sin(90-θ)=cosθ',    insert: '\\sin(90^\\circ-\\theta) = \\cos\\theta' },
      { label: 'cos(90-θ)=sinθ',    insert: '\\cos(90^\\circ-\\theta) = \\sin\\theta' },
      { label: 'tan(90-θ)=cotθ',    insert: '\\tan(90^\\circ-\\theta) = \\cot\\theta' },
    ],
  },
  {
    group: 'Statistics',
    items: [
      { label: 'Mean = Σx/n',       insert: '\\bar{x} = \\frac{\\sum x}{n}' },
      { label: 'Mean = Σfx/Σf',     insert: '\\bar{x} = \\frac{\\sum f_i x_i}{\\sum f_i}' },
      { label: 'Mean (step dev)',    insert: '\\bar{x} = a + h\\cdot\\frac{\\sum f_i u_i}{\\sum f_i}' },
      { label: 'Median',            insert: '\\text{Median} = l + \\frac{\\frac{n}{2}-cf}{f} \\times h' },
      { label: 'Mode',              insert: '\\text{Mode} = l + \\frac{f_1-f_0}{2f_1-f_0-f_2} \\times h' },
      { label: '3 Median = Mode+2Mean', insert: '3\\,\\text{Median} = \\text{Mode} + 2\\,\\text{Mean}' },
      { label: 'σ = √(Σ(x-x̄)²/n)', insert: '\\sigma = \\sqrt{\\frac{\\sum(x_i-\\bar{x})^2}{n}}' },
    ],
  },
  {
    group: 'Probability',
    items: [
      { label: 'P(E) = n(E)/n(S)',  insert: 'P(E) = \\frac{n(E)}{n(S)}' },
      { label: 'P(E)+P(Ē)=1',      insert: 'P(E) + P(\\bar{E}) = 1' },
      { label: '0 ≤ P(E) ≤ 1',     insert: '0 \\le P(E) \\le 1' },
      { label: 'P(A∪B)',           insert: 'P(A \\cup B) = P(A) + P(B) - P(A \\cap B)' },
      { label: 'P(A∩B) mutually excl.', insert: 'P(A \\cap B) = 0 \\text{ (mutually exclusive)}' },
    ],
  },
  {
    group: 'Number Theory',
    items: [
      { label: 'HCF×LCM = a×b',    insert: 'HCF(a,b) \\times LCM(a,b) = a \\times b' },
      { label: 'Euclid\'s algorithm', insert: 'a = bq + r,\\quad 0 \\le r < b' },
      { label: 'aⁿ × aᵐ',          insert: 'a^n \\times a^m = a^{n+m}' },
      { label: 'aⁿ / aᵐ',          insert: '\\frac{a^n}{a^m} = a^{n-m}' },
      { label: '(aⁿ)ᵐ',            insert: '(a^n)^m = a^{nm}' },
      { label: 'a⁰ = 1',           insert: 'a^0 = 1 \\quad (a \\ne 0)' },
      { label: 'a⁻ⁿ = 1/aⁿ',      insert: 'a^{-n} = \\frac{1}{a^n}' },
      { label: '√(ab) = √a·√b',    insert: '\\sqrt{ab} = \\sqrt{a} \\cdot \\sqrt{b}' },
    ],
  },
  {
    group: 'Financial Math',
    items: [
      { label: 'SI = PRT/100',      insert: 'SI = \\frac{P \\times R \\times T}{100}' },
      { label: 'A = P+SI',          insert: 'A = P + SI' },
      { label: 'CI: A = P(1+r/100)ⁿ', insert: 'A = P\\left(1 + \\frac{r}{100}\\right)^n' },
      { label: 'CI = A − P',        insert: 'CI = A - P' },
      { label: 'Profit% = P/CP×100', insert: '\\text{Profit}\\% = \\frac{\\text{Profit}}{CP} \\times 100' },
      { label: 'Loss% = L/CP×100',  insert: '\\text{Loss}\\% = \\frac{\\text{Loss}}{CP} \\times 100' },
      { label: 'Discount = MP−SP',  insert: '\\text{Discount} = MP - SP' },
      { label: 'Discount% = D/MP×100', insert: '\\text{Discount}\\% = \\frac{D}{MP} \\times 100' },
    ],
  },
  {
    group: 'Similar Triangles & Ratios',
    items: [
      { label: 'BPT',               insert: '\\frac{AD}{DB} = \\frac{AE}{EC}' },
      { label: 'AA similarity',     insert: '\\triangle ABC \\sim \\triangle DEF \\text{ (AA)}' },
      { label: 'Area ratio',        insert: '\\frac{\\text{Area}(\\triangle ABC)}{\\text{Area}(\\triangle DEF)} = \\frac{AB^2}{DE^2}' },
      { label: 'Tangent ⊥ radius',  insert: 'OP \\perp AB \\text{ (tangent-radius)}' },
      { label: 'Tangents from ext. pt.', insert: 'PA = PB \\text{ (equal tangents)}' },
    ],
  },
  {
    group: 'Mole Concept (Chem-Math)',
    items: [
      { label: 'n = m/M',           insert: 'n = \\frac{m}{M}' },
      { label: 'N = n × Nₐ',       insert: 'N = n \\times N_A' },
      { label: 'n = N/Nₐ',         insert: 'n = \\frac{N}{N_A}' },
      { label: 'm = n × M',         insert: 'm = n \\times M' },
      { label: 'Nₐ = 6.022×10²³',  insert: 'N_A = 6.022 \\times 10^{23} \\text{ mol}^{-1}' },
    ],
  },
];

// ─── SYMBOLS ─────────────────────────────────────────────────────────────────
const SYMBOLS = [
  {
    group: 'Reaction Arrows',
    items: [
      { label: '→',           insert: '\\rightarrow' },
      { label: '⇌',           insert: '\\rightleftharpoons' },
      { label: '↑ (gas)',     insert: '\\uparrow' },
      { label: '↓ (ppt)',     insert: '\\downarrow' },
      { label: '→Δ',          insert: '\\xrightarrow{\\Delta}' },
      { label: '→hν',         insert: '\\xrightarrow{h\\nu}' },
      { label: '→catalyst',   insert: '\\xrightarrow{\\text{catalyst}}' },
      { label: '→electrolysis', insert: '\\xrightarrow{\\text{electrolysis}}' },
      { label: '⟹',           insert: '\\Rightarrow' },
      { label: '⟺',           insert: '\\Leftrightarrow' },
    ],
  },
  {
    group: 'State Symbols',
    items: [
      { label: '(s)',         insert: '(s)' },
      { label: '(l)',         insert: '(l)' },
      { label: '(g)',         insert: '(g)' },
      { label: '(aq)',        insert: '(aq)' },
    ],
  },
  {
    group: 'Greek — Math',
    items: [
      { label: 'α',   insert: '\\alpha' },
      { label: 'β',   insert: '\\beta' },
      { label: 'γ',   insert: '\\gamma' },
      { label: 'δ',   insert: '\\delta' },
      { label: 'θ',   insert: '\\theta' },
      { label: 'λ',   insert: '\\lambda' },
      { label: 'μ',   insert: '\\mu' },
      { label: 'π',   insert: '\\pi' },
      { label: 'σ',   insert: '\\sigma' },
      { label: 'φ',   insert: '\\phi' },
      { label: 'ω',   insert: '\\omega' },
      { label: 'Σ',   insert: '\\Sigma' },
      { label: 'Δ',   insert: '\\Delta' },
      { label: 'Ω',   insert: '\\Omega' },
    ],
  },
  {
    group: 'Greek — Physics',
    items: [
      { label: 'ρ (density)',   insert: '\\rho' },
      { label: 'η (efficiency)', insert: '\\eta' },
      { label: 'ε (epsilon)',   insert: '\\varepsilon' },
      { label: 'τ (torque)',    insert: '\\tau' },
      { label: 'ν (frequency)', insert: '\\nu' },
      { label: 'χ (chi)',       insert: '\\chi' },
    ],
  },
  {
    group: 'Math Operators',
    items: [
      { label: '±',         insert: '\\pm' },
      { label: '∓',         insert: '\\mp' },
      { label: '×',         insert: '\\times' },
      { label: '÷',         insert: '\\div' },
      { label: '≠',         insert: '\\ne' },
      { label: '≈',         insert: '\\approx' },
      { label: '≤',         insert: '\\le' },
      { label: '≥',         insert: '\\ge' },
      { label: '∝',         insert: '\\propto' },
      { label: '∞',         insert: '\\infty' },
      { label: '√',         insert: '\\sqrt{}' },
      { label: '∛',         insert: '\\sqrt[3]{}' },
      { label: 'Σ',         insert: '\\sum' },
      { label: '∫',         insert: '\\int' },
      { label: '°',         insert: '^\\circ' },
      { label: '∠',         insert: '\\angle' },
      { label: '∴',         insert: '\\therefore' },
      { label: '∵',         insert: '\\because' },
      { label: '∈',         insert: '\\in' },
      { label: '⊥',         insert: '\\perp' },
      { label: '∥',         insert: '\\parallel' },
      { label: '△',         insert: '\\triangle' },
    ],
  },
  {
    group: 'Fractions & Powers',
    items: [
      { label: '½',         insert: '\\frac{1}{2}' },
      { label: '⅓',         insert: '\\frac{1}{3}' },
      { label: '¼',         insert: '\\frac{1}{4}' },
      { label: '¾',         insert: '\\frac{3}{4}' },
      { label: 'a/b',       insert: '\\frac{a}{b}' },
      { label: 'x²',        insert: 'x^2' },
      { label: 'x³',        insert: 'x^3' },
      { label: 'xⁿ',        insert: 'x^n' },
      { label: '10²',       insert: '10^2' },
      { label: '10³',       insert: '10^3' },
      { label: '10⁻¹',      insert: '10^{-1}' },
      { label: '10⁻²',      insert: '10^{-2}' },
      { label: '10⁻³',      insert: '10^{-3}' },
      { label: '10⁻¹⁹',     insert: '10^{-19}' },
      { label: '10⁻³¹',     insert: '10^{-31}' },
    ],
  },
];

// ─── TABS ────────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'chem',    label: '⚗ Chemistry', data: CHEMISTRY },
  { key: 'physics', label: '⚡ Physics',   data: PHYSICS },
  { key: 'math',    label: '∑ Math',      data: MATH },
  { key: 'symbols', label: '🔣 Symbols',  data: SYMBOLS },
];

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = {
  root:  { display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#fafafa', userSelect: 'none', fontSize: '12px' },
  tabBar: { display: 'flex', borderBottom: '1px solid #ddd', backgroundColor: '#f0f0f0', flexShrink: 0 },
  tab: (a) => ({ flex: 1, padding: '6px 3px', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: a ? '700' : '400', color: a ? '#1565c0' : '#555', backgroundColor: a ? '#fff' : 'transparent', borderBottom: a ? '2px solid #1565c0' : '2px solid transparent' }),
  search: { width: '100%', padding: '5px 8px', fontSize: '12px', border: '1px solid #ccc', borderBottom: '1px solid #ddd', outline: 'none', boxSizing: 'border-box', flexShrink: 0 },
  scroll: { flex: 1, overflowY: 'auto', padding: '4px 6px' },
  groupLabel: { fontSize: '9px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '8px', marginBottom: '3px' },
  btnRow: { display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '2px' },
  btnChem:    { padding: '3px 5px', fontSize: '11px', border: '1px solid #b2dfdb', borderRadius: '3px', cursor: 'pointer', backgroundColor: '#e0f2f1', color: '#004d40', lineHeight: '1.4' },
  btnPhys:    { padding: '3px 5px', fontSize: '11px', border: '1px solid #bbdefb', borderRadius: '3px', cursor: 'pointer', backgroundColor: '#e3f2fd', color: '#0d47a1', lineHeight: '1.4' },
  btnMath:    { padding: '3px 5px', fontSize: '11px', border: '1px solid #e1bee7', borderRadius: '3px', cursor: 'pointer', backgroundColor: '#f3e5f5', color: '#4a148c', lineHeight: '1.4' },
  btnSym:     { padding: '3px 5px', fontSize: '11px', border: '1px solid #ffe0b2', borderRadius: '3px', cursor: 'pointer', backgroundColor: '#fff8e1', color: '#bf360c', lineHeight: '1.4' },
  btnReaction:{ padding: '3px 5px', fontSize: '11px', border: '1px solid #ffccbc', borderRadius: '3px', cursor: 'pointer', backgroundColor: '#fbe9e7', color: '#bf360c', lineHeight: '1.4', maxWidth: '100%' },
};

const REACTION_GROUPS = new Set(['Key Reactions', 'Metal + Oxygen', 'Metal + Water', 'Metal + Acid', 'Displacement Reactions', 'Double Displacement / Ppt', 'Decomposition', 'Redox Reactions', 'Combustion', 'Organic Reactions', 'Metallurgy Equations', 'Electrolysis', 'Environmental Chemistry']);

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function FormulaKeyboard() {
  const [activeTab, setActiveTab] = useState('chem');
  const [query, setQuery] = useState('');

  const currentTab = TABS.find((t) => t.key === activeTab);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return currentTab.data;
    return currentTab.data
      .map((sec) => ({ ...sec, items: sec.items.filter((it) => it.label.toLowerCase().includes(q) || (it.name || '').toLowerCase().includes(q) || it.insert.toLowerCase().includes(q)) }))
      .filter((sec) => sec.items.length > 0);
  }, [query, currentTab]);

  function getBtnStyle(tabKey, groupName) {
    if (REACTION_GROUPS.has(groupName)) return S.btnReaction;
    if (tabKey === 'chem') return S.btnChem;
    if (tabKey === 'physics') return S.btnPhys;
    if (tabKey === 'symbols') return S.btnSym;
    return S.btnMath;
  }

  return (
    <div style={S.root} onMouseDown={(e) => e.preventDefault()}>
      <div style={S.tabBar}>
        {TABS.map((t) => (
          <button key={t.key} style={S.tab(activeTab === t.key)} onClick={() => { setActiveTab(t.key); setQuery(''); }}>
            {t.label}
          </button>
        ))}
      </div>
      <input
        style={S.search}
        placeholder="Search formulas…"
        value={query}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div style={S.scroll}>
        {filtered.length === 0
          ? <div style={{ padding: '16px', color: '#aaa', textAlign: 'center' }}>No results</div>
          : filtered.map((section) => (
            <div key={section.group}>
              <div style={S.groupLabel}>{section.group}</div>
              <div style={S.btnRow}>
                {section.items.map((item) => (
                  <button
                    key={item.insert}
                    style={getBtnStyle(activeTab, section.group)}
                    onClick={() => insertAtCursor(item.insert)}
                    title={item.insert}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}
