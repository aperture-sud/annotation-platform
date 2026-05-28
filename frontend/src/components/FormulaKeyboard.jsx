import { useState } from 'react';

function insertAtCursor(text) {
  const el = document.activeElement;
  if (!el || (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT')) return;
  const start = el.selectionStart ?? el.value.length;
  const end   = el.selectionEnd   ?? el.value.length;
  const newVal = el.value.slice(0, start) + text + el.value.slice(end);
  const proto  = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) {
    setter.call(el, newVal);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  requestAnimationFrame(() => {
    const pos = start + text.length;
    el.setSelectionRange(pos, pos);
    el.focus();
  });
}

// ─── DATA ────────────────────────────────────────────────────────────────────

const CHEMISTRY = [
  {
    group: 'Common Compounds',
    items: [
      { label: 'H₂O',       name: 'Water',               insert: 'H_2O' },
      { label: 'CO₂',       name: 'Carbon dioxide',      insert: 'CO_2' },
      { label: 'O₂',        name: 'Oxygen',              insert: 'O_2' },
      { label: 'H₂',        name: 'Hydrogen',            insert: 'H_2' },
      { label: 'N₂',        name: 'Nitrogen',            insert: 'N_2' },
      { label: 'NH₃',       name: 'Ammonia',             insert: 'NH_3' },
      { label: 'CH₄',       name: 'Methane',             insert: 'CH_4' },
      { label: 'CO',        name: 'Carbon monoxide',     insert: 'CO' },
      { label: 'SO₂',       name: 'Sulphur dioxide',     insert: 'SO_2' },
      { label: 'SO₃',       name: 'Sulphur trioxide',    insert: 'SO_3' },
      { label: 'NO',        name: 'Nitric oxide',        insert: 'NO' },
      { label: 'NO₂',       name: 'Nitrogen dioxide',    insert: 'NO_2' },
      { label: 'N₂O',       name: 'Nitrous oxide',       insert: 'N_2O' },
      { label: 'O₃',        name: 'Ozone',               insert: 'O_3' },
      { label: 'H₂O₂',      name: 'Hydrogen peroxide',  insert: 'H_2O_2' },
      { label: 'Cl₂',       name: 'Chlorine',            insert: 'Cl_2' },
      { label: 'Br₂',       name: 'Bromine',             insert: 'Br_2' },
      { label: 'I₂',        name: 'Iodine',              insert: 'I_2' },
    ],
  },
  {
    group: 'Acids',
    items: [
      { label: 'HCl',       name: 'Hydrochloric acid',  insert: 'HCl' },
      { label: 'H₂SO₄',    name: 'Sulphuric acid',     insert: 'H_2SO_4' },
      { label: 'HNO₃',     name: 'Nitric acid',        insert: 'HNO_3' },
      { label: 'H₃PO₄',    name: 'Phosphoric acid',    insert: 'H_3PO_4' },
      { label: 'H₂CO₃',    name: 'Carbonic acid',      insert: 'H_2CO_3' },
      { label: 'H₂SO₃',    name: 'Sulphurous acid',    insert: 'H_2SO_3' },
      { label: 'CH₃COOH',  name: 'Acetic acid',        insert: 'CH_3COOH' },
      { label: 'C₃H₆O₃',   name: 'Lactic acid',        insert: 'C_3H_6O_3' },
      { label: 'C₆H₈O₇',   name: 'Citric acid',        insert: 'C_6H_8O_7' },
    ],
  },
  {
    group: 'Bases',
    items: [
      { label: 'NaOH',      name: 'Sodium hydroxide',       insert: 'NaOH' },
      { label: 'KOH',       name: 'Potassium hydroxide',    insert: 'KOH' },
      { label: 'Ca(OH)₂',  name: 'Calcium hydroxide',      insert: 'Ca(OH)_2' },
      { label: 'Mg(OH)₂',  name: 'Magnesium hydroxide',    insert: 'Mg(OH)_2' },
      { label: 'Al(OH)₃',  name: 'Aluminium hydroxide',    insert: 'Al(OH)_3' },
      { label: 'Fe(OH)₃',  name: 'Iron(III) hydroxide',    insert: 'Fe(OH)_3' },
      { label: 'Cu(OH)₂',  name: 'Copper(II) hydroxide',   insert: 'Cu(OH)_2' },
      { label: 'NH₄OH',    name: 'Ammonium hydroxide',     insert: 'NH_4OH' },
    ],
  },
  {
    group: 'Salts & Oxides',
    items: [
      { label: 'NaCl',      name: 'Common salt',            insert: 'NaCl' },
      { label: 'CaCO₃',    name: 'Calcium carbonate',      insert: 'CaCO_3' },
      { label: 'Na₂CO₃',   name: 'Washing soda',           insert: 'Na_2CO_3' },
      { label: 'NaHCO₃',   name: 'Baking soda',            insert: 'NaHCO_3' },
      { label: 'CaO',       name: 'Quicklime',              insert: 'CaO' },
      { label: 'MgO',       name: 'Magnesium oxide',        insert: 'MgO' },
      { label: 'ZnO',       name: 'Zinc oxide',             insert: 'ZnO' },
      { label: 'Al₂O₃',    name: 'Aluminium oxide',        insert: 'Al_2O_3' },
      { label: 'Fe₂O₃',    name: 'Rust / Iron oxide',      insert: 'Fe_2O_3' },
      { label: 'Fe₃O₄',    name: 'Magnetic iron oxide',    insert: 'Fe_3O_4' },
      { label: 'CuO',       name: 'Copper oxide',           insert: 'CuO' },
      { label: 'CuSO₄',    name: 'Copper sulphate',        insert: 'CuSO_4' },
      { label: 'ZnSO₄',    name: 'Zinc sulphate',          insert: 'ZnSO_4' },
      { label: 'FeSO₄',    name: 'Iron(II) sulphate',      insert: 'FeSO_4' },
      { label: 'MgSO₄',    name: 'Magnesium sulphate',     insert: 'MgSO_4' },
      { label: 'KMnO₄',    name: 'Potassium permanganate', insert: 'KMnO_4' },
      { label: 'AgNO₃',    name: 'Silver nitrate',         insert: 'AgNO_3' },
      { label: 'BaSO₄',    name: 'Barium sulphate',        insert: 'BaSO_4' },
      { label: 'AgCl',      name: 'Silver chloride',        insert: 'AgCl' },
      { label: 'Na₂SO₄',   name: 'Sodium sulphate',        insert: 'Na_2SO_4' },
      { label: 'K₂SO₄',    name: 'Potassium sulphate',     insert: 'K_2SO_4' },
      { label: 'KCl',       name: 'Potassium chloride',     insert: 'KCl' },
      { label: 'KNO₃',     name: 'Potassium nitrate',      insert: 'KNO_3' },
      { label: 'Ca(NO₃)₂', name: 'Calcium nitrate',        insert: 'Ca(NO_3)_2' },
      { label: 'PbI₂',     name: 'Lead iodide',            insert: 'PbI_2' },
      { label: 'BaCl₂',    name: 'Barium chloride',        insert: 'BaCl_2' },
    ],
  },
  {
    group: 'Organic',
    items: [
      { label: 'C₂H₅OH',    name: 'Ethanol (alcohol)',   insert: 'C_2H_5OH' },
      { label: 'C₆H₁₂O₆',   name: 'Glucose',            insert: 'C_6H_{12}O_6' },
      { label: 'C₁₂H₂₂O₁₁', name: 'Sucrose (sugar)',    insert: 'C_{12}H_{22}O_{11}' },
      { label: 'C₆H₆',      name: 'Benzene',            insert: 'C_6H_6' },
      { label: 'C₆H₁₀O₅',   name: 'Cellulose (unit)',   insert: '(C_6H_{10}O_5)_n' },
      { label: 'C₂H₆',      name: 'Ethane',             insert: 'C_2H_6' },
      { label: 'C₃H₈',      name: 'Propane (LPG)',       insert: 'C_3H_8' },
      { label: 'C₄H₁₀',     name: 'Butane (LPG)',        insert: 'C_4H_{10}' },
      { label: 'C₈H₁₈',     name: 'Octane (petrol)',     insert: 'C_8H_{18}' },
      { label: 'HCHO',      name: 'Formaldehyde',        insert: 'HCHO' },
      { label: 'CH₃CHO',   name: 'Acetaldehyde',        insert: 'CH_3CHO' },
      { label: 'C₁₀H₈',    name: 'Naphthalene',         insert: 'C_{10}H_8' },
    ],
  },
  {
    group: 'Key Reactions',
    items: [
      {
        label: 'Photosynthesis',
        name: '6CO₂+6H₂O → C₆H₁₂O₆+6O₂',
        insert: '6CO_2 + 6H_2O \\xrightarrow{\\text{sunlight}} C_6H_{12}O_6 + 6O_2',
      },
      {
        label: 'Respiration',
        name: 'C₆H₁₂O₆+6O₂ → 6CO₂+6H₂O',
        insert: 'C_6H_{12}O_6 + 6O_2 \\rightarrow 6CO_2 + 6H_2O',
      },
      {
        label: 'H₂O electrolysis',
        name: '2H₂O → 2H₂+O₂',
        insert: '2H_2O \\rightarrow 2H_2\\uparrow + O_2\\uparrow',
      },
      {
        label: 'Burn H₂',
        name: '2H₂+O₂ → 2H₂O',
        insert: '2H_2 + O_2 \\rightarrow 2H_2O',
      },
      {
        label: 'Burn CH₄',
        name: 'CH₄+2O₂ → CO₂+2H₂O',
        insert: 'CH_4 + 2O_2 \\rightarrow CO_2 + 2H_2O',
      },
      {
        label: 'Burn Mg',
        name: '2Mg+O₂ → 2MgO',
        insert: '2Mg + O_2 \\rightarrow 2MgO',
      },
      {
        label: 'Rusting',
        name: '4Fe+3O₂ → 2Fe₂O₃',
        insert: '4Fe + 3O_2 \\rightarrow 2Fe_2O_3',
      },
      {
        label: 'CaCO₃ → CaO',
        name: 'CaCO₃ → CaO+CO₂',
        insert: 'CaCO_3 \\xrightarrow{\\Delta} CaO + CO_2',
      },
      {
        label: 'Slaking lime',
        name: 'CaO+H₂O → Ca(OH)₂',
        insert: 'CaO + H_2O \\rightarrow Ca(OH)_2',
      },
      {
        label: 'Haber process',
        name: 'N₂+3H₂ ⇌ 2NH₃',
        insert: 'N_2 + 3H_2 \\rightleftharpoons 2NH_3',
      },
      {
        label: 'Na+H₂O',
        name: '2Na+2H₂O → 2NaOH+H₂',
        insert: '2Na + 2H_2O \\rightarrow 2NaOH + H_2\\uparrow',
      },
      {
        label: 'Fe+CuSO₄',
        name: 'Fe+CuSO₄ → FeSO₄+Cu',
        insert: 'Fe + CuSO_4 \\rightarrow FeSO_4 + Cu',
      },
      {
        label: 'Fermentation',
        name: 'C₆H₁₂O₆ → 2C₂H₅OH+2CO₂',
        insert: 'C_6H_{12}O_6 \\rightarrow 2C_2H_5OH + 2CO_2',
      },
      {
        label: 'Acid rain SO₂',
        name: 'SO₂+H₂O → H₂SO₃',
        insert: 'SO_2 + H_2O \\rightarrow H_2SO_3',
      },
      {
        label: 'Acid rain SO₃',
        name: 'SO₃+H₂O → H₂SO₄',
        insert: 'SO_3 + H_2O \\rightarrow H_2SO_4',
      },
      {
        label: 'CO₂ + H₂O',
        name: 'CO₂+H₂O → H₂CO₃',
        insert: 'CO_2 + H_2O \\rightarrow H_2CO_3',
      },
      {
        label: 'Thermite',
        name: '2Al+Fe₂O₃ → Al₂O₃+2Fe',
        insert: '2Al + Fe_2O_3 \\rightarrow Al_2O_3 + 2Fe',
      },
      {
        label: 'Brine electrolysis',
        name: '2NaCl+2H₂O → 2NaOH+H₂+Cl₂',
        insert: '2NaCl(aq) + 2H_2O \\rightarrow 2NaOH + H_2\\uparrow + Cl_2\\uparrow',
      },
      {
        label: 'Zn+H₂SO₄',
        name: 'Zn+H₂SO₄ → ZnSO₄+H₂',
        insert: 'Zn + H_2SO_4 \\rightarrow ZnSO_4 + H_2\\uparrow',
      },
      {
        label: 'Mg burns',
        name: '2Mg+O₂ → 2MgO',
        insert: '2Mg + O_2 \\rightarrow 2MgO',
      },
    ],
  },
  {
    group: 'Ions',
    items: [
      { label: 'H⁺',     name: 'Hydrogen ion',     insert: 'H^+' },
      { label: 'OH⁻',    name: 'Hydroxide ion',    insert: 'OH^-' },
      { label: 'Na⁺',    name: 'Sodium ion',       insert: 'Na^+' },
      { label: 'K⁺',     name: 'Potassium ion',    insert: 'K^+' },
      { label: 'Ca²⁺',   name: 'Calcium ion',      insert: 'Ca^{2+}' },
      { label: 'Mg²⁺',   name: 'Magnesium ion',    insert: 'Mg^{2+}' },
      { label: 'Fe²⁺',   name: 'Iron(II) ion',     insert: 'Fe^{2+}' },
      { label: 'Fe³⁺',   name: 'Iron(III) ion',    insert: 'Fe^{3+}' },
      { label: 'Cu²⁺',   name: 'Copper ion',       insert: 'Cu^{2+}' },
      { label: 'Zn²⁺',   name: 'Zinc ion',         insert: 'Zn^{2+}' },
      { label: 'Al³⁺',   name: 'Aluminium ion',    insert: 'Al^{3+}' },
      { label: 'Cl⁻',    name: 'Chloride ion',     insert: 'Cl^-' },
      { label: 'SO₄²⁻',  name: 'Sulphate ion',     insert: 'SO_4^{2-}' },
      { label: 'CO₃²⁻',  name: 'Carbonate ion',    insert: 'CO_3^{2-}' },
      { label: 'NO₃⁻',   name: 'Nitrate ion',      insert: 'NO_3^-' },
      { label: 'PO₄³⁻',  name: 'Phosphate ion',    insert: 'PO_4^{3-}' },
      { label: 'NH₄⁺',   name: 'Ammonium ion',     insert: 'NH_4^+' },
      { label: 'HCO₃⁻',  name: 'Bicarbonate ion',  insert: 'HCO_3^-' },
    ],
  },
];

const PHYSICS = [
  {
    group: 'Motion (Kinematics)',
    items: [
      { label: 'v = u + at',        name: 'First equation of motion',   insert: 'v = u + at' },
      { label: 's = ut + ½at²',     name: 'Second equation of motion',  insert: 's = ut + \\frac{1}{2}at^2' },
      { label: 'v² = u² + 2as',     name: 'Third equation of motion',   insert: 'v^2 = u^2 + 2as' },
      { label: 's = (u+v)/2 · t',   name: 'Average velocity form',      insert: 's = \\frac{u+v}{2} \\cdot t' },
      { label: 'a = (v-u)/t',       name: 'Acceleration',               insert: 'a = \\frac{v-u}{t}' },
      { label: 'v_avg = d/t',       name: 'Average speed',              insert: 'v_{avg} = \\frac{d}{t}' },
      { label: 'slope = Δy/Δx',     name: 'Gradient / slope',           insert: '\\text{slope} = \\frac{\\Delta y}{\\Delta x}' },
    ],
  },
  {
    group: 'Force & Newton\'s Laws',
    items: [
      { label: 'F = ma',            name: 'Newton\'s 2nd law',          insert: 'F = ma' },
      { label: 'p = mv',            name: 'Momentum',                   insert: 'p = mv' },
      { label: 'F = Δp/t',          name: 'Force = rate of change of p',insert: 'F = \\frac{\\Delta p}{t}' },
      { label: 'F·t = mv − mu',     name: 'Impulse-momentum theorem',   insert: 'F \\cdot t = mv - mu' },
      { label: 'W = mg',            name: 'Weight',                     insert: 'W = mg' },
      { label: 'f = μN',            name: 'Friction force',             insert: 'f = \\mu N' },
      { label: 'fₛ = μₛN',         name: 'Static friction',            insert: 'f_s = \\mu_s N' },
      { label: 'fₖ = μₖN',         name: 'Kinetic friction',           insert: 'f_k = \\mu_k N' },
      { label: 'F₁/A₁ = F₂/A₂',   name: 'Pascal\'s law (hydraulic)',  insert: '\\frac{F_1}{A_1} = \\frac{F_2}{A_2}' },
    ],
  },
  {
    group: 'Gravitation',
    items: [
      { label: 'F = Gm₁m₂/r²',    name: 'Newton\'s law of gravitation', insert: 'F = \\frac{Gm_1m_2}{r^2}' },
      { label: 'g = GM/R²',        name: 'Gravity at surface',          insert: 'g = \\frac{GM}{R^2}' },
      { label: 'g = 9.8 m/s²',     name: 'Standard gravity',            insert: 'g = 9.8 \\text{ m/s}^2' },
      { label: 'vₑ = √(2gR)',      name: 'Escape velocity',             insert: 'v_e = \\sqrt{2gR}' },
      { label: 'vₒ = √(gR)',       name: 'Orbital velocity',            insert: 'v_o = \\sqrt{gR}' },
      { label: 'T = 2π√(R/g)',     name: 'Satellite time period',       insert: 'T = 2\\pi\\sqrt{\\frac{R}{g}}' },
      { label: 'G = 6.67×10⁻¹¹',  name: 'Gravitational constant G',   insert: 'G = 6.67 \\times 10^{-11} \\text{ N·m}^2/\\text{kg}^2' },
    ],
  },
  {
    group: 'Pressure & Fluids',
    items: [
      { label: 'P = F/A',           name: 'Pressure',                   insert: 'P = \\frac{F}{A}' },
      { label: 'P = ρgh',           name: 'Pressure in fluid',          insert: 'P = \\rho g h' },
      { label: 'P_total = P₀+ρgh',  name: 'Total pressure at depth h',  insert: 'P_{total} = P_0 + \\rho g h' },
      { label: '1 Pa = 1 N/m²',     name: 'Pascal definition',          insert: '1 \\text{ Pa} = 1 \\text{ N/m}^2' },
      { label: '1 atm = 101325 Pa', name: 'Standard atmosphere',        insert: '1 \\text{ atm} = 101325 \\text{ Pa}' },
    ],
  },
  {
    group: 'Sound & Waves',
    items: [
      { label: 'v = fλ',            name: 'Wave equation',              insert: 'v = f\\lambda' },
      { label: 'f = 1/T',           name: 'Frequency',                  insert: 'f = \\frac{1}{T}' },
      { label: 'T = 1/f',           name: 'Time period',                insert: 'T = \\frac{1}{f}' },
      { label: 'λ = v/f',           name: 'Wavelength',                 insert: '\\lambda = \\frac{v}{f}' },
      { label: 'd = vt/2',          name: 'Echo distance formula',      insert: 'd = \\frac{vt}{2}' },
      { label: 'v_sound = 340 m/s', name: 'Speed of sound in air',     insert: 'v_{sound} = 340 \\text{ m/s}' },
    ],
  },
  {
    group: 'Light & Optics',
    items: [
      { label: '∠i = ∠r',          name: 'Law of reflection',          insert: '\\angle i = \\angle r' },
      { label: 'n = c/v',           name: 'Refractive index',           insert: 'n = \\frac{c}{v}' },
      { label: 'n = sin i/sin r',   name: 'Snell\'s law (basic)',       insert: 'n = \\frac{\\sin i}{\\sin r}' },
      { label: 'n₁sinθ₁=n₂sinθ₂',  name: 'Snell\'s law (general)',     insert: 'n_1 \\sin\\theta_1 = n_2 \\sin\\theta_2' },
      { label: '1/f = 1/v − 1/u',  name: 'Lens formula',               insert: '\\frac{1}{f} = \\frac{1}{v} - \\frac{1}{u}' },
      { label: 'm = v/u',           name: 'Magnification (lens)',       insert: 'm = \\frac{v}{u}' },
      { label: 'm = h_i/h_o',       name: 'Magnification (image/obj)', insert: 'm = \\frac{h_i}{h_o}' },
      { label: 'c = 3×10⁸ m/s',    name: 'Speed of light',             insert: 'c = 3 \\times 10^8 \\text{ m/s}' },
    ],
  },
  {
    group: 'Work, Energy & Power',
    items: [
      { label: 'W = Fs cosθ',       name: 'Work done',                  insert: 'W = Fs\\cos\\theta' },
      { label: 'KE = ½mv²',        name: 'Kinetic energy',             insert: 'KE = \\frac{1}{2}mv^2' },
      { label: 'PE = mgh',          name: 'Potential energy',           insert: 'PE = mgh' },
      { label: 'P = W/t',           name: 'Power',                      insert: 'P = \\frac{W}{t}' },
      { label: 'η = W_out/W_in',    name: 'Efficiency',                 insert: '\\eta = \\frac{W_{out}}{W_{in}}' },
      { label: 'E = mc²',           name: 'Mass-energy equivalence',    insert: 'E = mc^2' },
    ],
  },
  {
    group: 'Electricity',
    items: [
      { label: 'V = IR',            name: 'Ohm\'s law',                 insert: 'V = IR' },
      { label: 'R = V/I',           name: 'Resistance',                 insert: 'R = \\frac{V}{I}' },
      { label: 'P = VI',            name: 'Electric power',             insert: 'P = VI' },
      { label: 'P = I²R',           name: 'Power (in terms of I,R)',    insert: 'P = I^2 R' },
      { label: 'P = V²/R',          name: 'Power (in terms of V,R)',    insert: 'P = \\frac{V^2}{R}' },
      { label: 'Q = It',            name: 'Electric charge',            insert: 'Q = It' },
      { label: 'H = I²Rt',          name: 'Joule heating',              insert: 'H = I^2 Rt' },
      { label: 'R_s = R₁+R₂+…',    name: 'Series resistance',          insert: 'R_s = R_1 + R_2 + \\cdots' },
      { label: '1/R_p = 1/R₁+…',   name: 'Parallel resistance',        insert: '\\frac{1}{R_p} = \\frac{1}{R_1} + \\frac{1}{R_2} + \\cdots' },
      { label: 'F = kq₁q₂/r²',     name: 'Coulomb\'s law',             insert: 'F = \\frac{kq_1q_2}{r^2}' },
    ],
  },
  {
    group: 'Heat & Thermodynamics',
    items: [
      { label: 'Q = mcΔT',          name: 'Heat (specific heat capacity)', insert: 'Q = mc\\Delta T' },
      { label: 'Q = mL',            name: 'Latent heat',                insert: 'Q = mL' },
      { label: 'ΔT = T₂ − T₁',     name: 'Change in temperature',      insert: '\\Delta T = T_2 - T_1' },
      { label: 'K = °C + 273',      name: 'Celsius to Kelvin',          insert: 'K = {^\\circ}C + 273' },
      { label: '°C = K − 273',      name: 'Kelvin to Celsius',          insert: '{^\\circ}C = K - 273' },
      { label: '°F = (°C×9/5)+32',  name: 'Celsius to Fahrenheit',      insert: '{^\\circ}F = \\frac{9}{5}{^\\circ}C + 32' },
    ],
  },
];

const MATH = [
  {
    group: 'Algebra — Identities',
    items: [
      { label: '(a+b)²',           name: '(a+b)² = a²+2ab+b²',          insert: '(a+b)^2 = a^2 + 2ab + b^2' },
      { label: '(a−b)²',           name: '(a-b)² = a²-2ab+b²',          insert: '(a-b)^2 = a^2 - 2ab + b^2' },
      { label: 'a²−b²',            name: 'a²-b² = (a+b)(a-b)',          insert: 'a^2 - b^2 = (a+b)(a-b)' },
      { label: '(a+b+c)²',         name: 'Three-term square',            insert: '(a+b+c)^2 = a^2+b^2+c^2+2ab+2bc+2ca' },
      { label: '(a+b)³',           name: '(a+b)³',                      insert: '(a+b)^3 = a^3 + 3a^2b + 3ab^2 + b^3' },
      { label: '(a−b)³',           name: '(a-b)³',                      insert: '(a-b)^3 = a^3 - 3a^2b + 3ab^2 - b^3' },
      { label: 'a³+b³',            name: 'Sum of cubes',                 insert: 'a^3 + b^3 = (a+b)(a^2-ab+b^2)' },
      { label: 'a³−b³',            name: 'Difference of cubes',         insert: 'a^3 - b^3 = (a-b)(a^2+ab+b^2)' },
      { label: 'Quadratic formula', name: 'x = (-b±√(b²-4ac))/2a',     insert: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
      { label: 'Discriminant',      name: 'D = b²−4ac',                  insert: 'D = b^2 - 4ac' },
    ],
  },
  {
    group: 'Arithmetic Progressions',
    items: [
      { label: 'aₙ = a+(n−1)d',    name: 'nth term of AP',              insert: 'a_n = a + (n-1)d' },
      { label: 'Sₙ = n/2[2a+(n-1)d]', name: 'Sum of n terms of AP',    insert: 'S_n = \\frac{n}{2}[2a + (n-1)d]' },
      { label: 'Sₙ = n/2(a+l)',    name: 'Sum using first & last term', insert: 'S_n = \\frac{n}{2}(a + l)' },
      { label: 'd = aₙ − aₙ₋₁',   name: 'Common difference',           insert: 'd = a_n - a_{n-1}' },
    ],
  },
  {
    group: 'Geometry — Areas',
    items: [
      { label: 'A = ½bh',          name: 'Area of triangle',            insert: 'A = \\frac{1}{2}bh' },
      { label: 'Heron\'s formula', name: 'A = √(s(s-a)(s-b)(s-c))',    insert: 'A = \\sqrt{s(s-a)(s-b)(s-c)}, \\quad s = \\frac{a+b+c}{2}' },
      { label: 'A = πr²',          name: 'Area of circle',              insert: 'A = \\pi r^2' },
      { label: 'C = 2πr',          name: 'Circumference of circle',     insert: 'C = 2\\pi r' },
      { label: 'A_sector',         name: 'Area of sector',              insert: 'A = \\frac{\\theta}{360} \\pi r^2' },
      { label: 'A = lb',           name: 'Area of rectangle',           insert: 'A = lb' },
      { label: 'A = s²',           name: 'Area of square',              insert: 'A = s^2' },
      { label: 'A = ½d₁d₂',       name: 'Area of rhombus',             insert: 'A = \\frac{1}{2}d_1 d_2' },
      { label: 'A = ½(a+b)h',     name: 'Area of trapezium',           insert: 'A = \\frac{1}{2}(a+b)h' },
    ],
  },
  {
    group: 'Geometry — Volumes',
    items: [
      { label: 'V = a³',           name: 'Volume of cube',              insert: 'V = a^3' },
      { label: 'V = lbh',          name: 'Volume of cuboid',            insert: 'V = lbh' },
      { label: 'V = πr²h',         name: 'Volume of cylinder',          insert: 'V = \\pi r^2 h' },
      { label: 'V = ⅓πr²h',       name: 'Volume of cone',              insert: 'V = \\frac{1}{3}\\pi r^2 h' },
      { label: 'V = ⁴⁄₃πr³',      name: 'Volume of sphere',            insert: 'V = \\frac{4}{3}\\pi r^3' },
      { label: 'CSA_cyl = 2πrh',   name: 'Curved SA of cylinder',      insert: 'CSA = 2\\pi r h' },
      { label: 'TSA_cyl = 2πr(r+h)', name: 'Total SA of cylinder',     insert: 'TSA = 2\\pi r(r+h)' },
      { label: 'CSA_cone = πrl',   name: 'Curved SA of cone',          insert: 'CSA = \\pi r l' },
      { label: 'TSA_cone = πr(r+l)', name: 'Total SA of cone',         insert: 'TSA = \\pi r(r+l)' },
      { label: 'SA_sphere = 4πr²', name: 'Surface area of sphere',     insert: 'SA = 4\\pi r^2' },
      { label: 'l² = r²+h²',       name: 'Slant height of cone',       insert: 'l^2 = r^2 + h^2' },
    ],
  },
  {
    group: 'Pythagoras & Coordinate',
    items: [
      { label: 'a²+b² = c²',       name: 'Pythagoras theorem',          insert: 'a^2 + b^2 = c^2' },
      { label: 'Distance formula', name: 'd=√((x₂-x₁)²+(y₂-y₁)²)',    insert: 'd = \\sqrt{(x_2-x_1)^2 + (y_2-y_1)^2}' },
      { label: 'Midpoint',         name: 'M = ((x₁+x₂)/2, (y₁+y₂)/2)',insert: 'M = \\left(\\frac{x_1+x_2}{2},\\ \\frac{y_1+y_2}{2}\\right)' },
      { label: 'Section formula',  name: 'P = ((mx₂+nx₁)/(m+n), ...)', insert: 'P = \\left(\\frac{mx_2+nx_1}{m+n},\\ \\frac{my_2+ny_1}{m+n}\\right)' },
      { label: 'Slope m = Δy/Δx', name: 'Slope of a line',            insert: 'm = \\frac{y_2-y_1}{x_2-x_1}' },
      { label: 'y = mx + c',       name: 'Slope-intercept form',       insert: 'y = mx + c' },
      { label: 'Area of △ (coords)', name: 'Triangle by coordinates',  insert: 'A = \\frac{1}{2}|x_1(y_2-y_3)+x_2(y_3-y_1)+x_3(y_1-y_2)|' },
    ],
  },
  {
    group: 'Trigonometry',
    items: [
      { label: 'sin²θ+cos²θ=1',    name: 'Pythagorean identity',        insert: '\\sin^2\\theta + \\cos^2\\theta = 1' },
      { label: '1+tan²θ = sec²θ',  name: 'Secant identity',             insert: '1 + \\tan^2\\theta = \\sec^2\\theta' },
      { label: '1+cot²θ = csc²θ',  name: 'Cosecant identity',           insert: '1 + \\cot^2\\theta = \\csc^2\\theta' },
      { label: 'tanθ = sinθ/cosθ', name: 'Tangent definition',          insert: '\\tan\\theta = \\frac{\\sin\\theta}{\\cos\\theta}' },
      { label: 'sin(90−θ)=cosθ',   name: 'Complementary angle',        insert: '\\sin(90^\\circ - \\theta) = \\cos\\theta' },
      { label: 'cos(90−θ)=sinθ',   name: 'Complementary angle',        insert: '\\cos(90^\\circ - \\theta) = \\sin\\theta' },
      { label: 'tan(90−θ)=cotθ',   name: 'Complementary angle',        insert: '\\tan(90^\\circ - \\theta) = \\cot\\theta' },
      { label: 'sinθ = P/H',        name: 'sin in right triangle',       insert: '\\sin\\theta = \\frac{\\text{Opposite}}{\\text{Hypotenuse}}' },
      { label: 'cosθ = B/H',        name: 'cos in right triangle',       insert: '\\cos\\theta = \\frac{\\text{Adjacent}}{\\text{Hypotenuse}}' },
      { label: 'tanθ = P/B',        name: 'tan in right triangle',       insert: '\\tan\\theta = \\frac{\\text{Opposite}}{\\text{Adjacent}}' },
      { label: 'tan of elevation',  name: 'Height = d·tan(θ)',           insert: 'h = d \\cdot \\tan\\theta' },
    ],
  },
  {
    group: 'Statistics & Probability',
    items: [
      { label: 'Mean = Σx/n',       name: 'Arithmetic mean',            insert: '\\bar{x} = \\frac{\\sum x}{n}' },
      { label: 'Mean = Σfx/Σf',    name: 'Weighted mean',              insert: '\\bar{x} = \\frac{\\sum f_i x_i}{\\sum f_i}' },
      { label: 'Median (odd n)',    name: 'Median = (n+1)/2 th value',  insert: '\\text{Median} = \\left(\\frac{n+1}{2}\\right)^{\\text{th}} \\text{ value}' },
      { label: 'Mode class',        name: 'Mode = L + [(f₁-f₀)/...]*h', insert: 'Mode = L + \\frac{f_1 - f_0}{2f_1 - f_0 - f_2} \\times h' },
      { label: 'P(E) = n(E)/n(S)', name: 'Probability',                insert: 'P(E) = \\frac{n(E)}{n(S)}' },
      { label: 'P(E)+P(Ē)=1',      name: 'Complement of event',        insert: 'P(E) + P(\\bar{E}) = 1' },
      { label: 'σ = √(Σ(x-x̄)²/n)','name': 'Standard deviation',      insert: '\\sigma = \\sqrt{\\frac{\\sum(x-\\bar{x})^2}{n}}' },
    ],
  },
  {
    group: 'Number Theory',
    items: [
      { label: 'HCF×LCM = a×b',    name: 'HCF-LCM product relation',   insert: 'HCF(a,b) \\times LCM(a,b) = a \\times b' },
      { label: 'Euclid\'s lemma',   name: 'a = bq + r',                 insert: 'a = bq + r, \\quad 0 \\le r < b' },
      { label: 'aⁿ × aᵐ = aⁿ⁺ᵐ',  name: 'Exponent product rule',      insert: 'a^n \\times a^m = a^{n+m}' },
      { label: 'aⁿ/aᵐ = aⁿ⁻ᵐ',    name: 'Exponent division rule',     insert: '\\frac{a^n}{a^m} = a^{n-m}' },
      { label: '(aⁿ)ᵐ = aⁿᵐ',     name: 'Power of a power',           insert: '(a^n)^m = a^{nm}' },
      { label: 'a⁰ = 1',           name: 'Zero exponent',              insert: 'a^0 = 1 \\quad (a \\ne 0)' },
      { label: 'a⁻ⁿ = 1/aⁿ',      name: 'Negative exponent',          insert: 'a^{-n} = \\frac{1}{a^n}' },
    ],
  },
];

const TABS = [
  { key: 'chem',    label: '⚗ Chemistry',  data: CHEMISTRY },
  { key: 'physics', label: '⚡ Physics',    data: PHYSICS },
  { key: 'math',    label: '∑ Math',       data: MATH },
];

// ─── STYLES ──────────────────────────────────────────────────────────────────

const S = {
  root: {
    display: 'flex', flexDirection: 'column', height: '100%',
    backgroundColor: '#fafafa', userSelect: 'none', fontSize: '12px',
  },
  tabBar: {
    display: 'flex', borderBottom: '1px solid #ddd', backgroundColor: '#f0f0f0', flexShrink: 0,
  },
  tab: (active) => ({
    flex: 1, padding: '7px 4px', border: 'none', cursor: 'pointer', fontSize: '11px',
    fontWeight: active ? '700' : '400',
    color: active ? '#1565c0' : '#555',
    backgroundColor: active ? '#fff' : 'transparent',
    borderBottom: active ? '2px solid #1565c0' : '2px solid transparent',
    transition: 'all 0.15s',
  }),
  scroll: { flex: 1, overflowY: 'auto', padding: '6px 8px' },
  groupLabel: {
    fontSize: '9px', fontWeight: '700', color: '#888', textTransform: 'uppercase',
    letterSpacing: '0.5px', marginTop: '10px', marginBottom: '4px',
  },
  btnRow: { display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '2px' },
  btn: {
    padding: '3px 6px', fontSize: '11px', border: '1px solid #ccc',
    borderRadius: '3px', cursor: 'pointer', backgroundColor: '#fff',
    color: '#222', lineHeight: '1.4', maxWidth: '100%', textAlign: 'left',
    whiteSpace: 'nowrap',
  },
  btnChem: {
    padding: '3px 6px', fontSize: '11px', border: '1px solid #b2dfdb',
    borderRadius: '3px', cursor: 'pointer', backgroundColor: '#e0f2f1',
    color: '#004d40', lineHeight: '1.4',
  },
  btnPhys: {
    padding: '3px 6px', fontSize: '11px', border: '1px solid #bbdefb',
    borderRadius: '3px', cursor: 'pointer', backgroundColor: '#e3f2fd',
    color: '#0d47a1', lineHeight: '1.4',
  },
  btnMath: {
    padding: '3px 6px', fontSize: '11px', border: '1px solid #e1bee7',
    borderRadius: '3px', cursor: 'pointer', backgroundColor: '#f3e5f5',
    color: '#4a148c', lineHeight: '1.4',
  },
  btnReaction: {
    padding: '3px 6px', fontSize: '11px', border: '1px solid #ffe0b2',
    borderRadius: '3px', cursor: 'pointer', backgroundColor: '#fff3e0',
    color: '#bf360c', lineHeight: '1.4', maxWidth: '100%',
  },
};

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function FormulaKeyboard() {
  const [activeTab, setActiveTab] = useState('chem');

  const currentTab = TABS.find((t) => t.key === activeTab);

  function getBtnStyle(tabKey, groupName) {
    if (groupName === 'Key Reactions') return S.btnReaction;
    if (tabKey === 'chem') return S.btnChem;
    if (tabKey === 'physics') return S.btnPhys;
    return S.btnMath;
  }

  return (
    <div style={S.root} onMouseDown={(e) => e.preventDefault()}>
      {/* Tab bar */}
      <div style={S.tabBar}>
        {TABS.map((t) => (
          <button
            key={t.key}
            style={S.tab(activeTab === t.key)}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={S.scroll}>
        {currentTab.data.map((section) => (
          <div key={section.group}>
            <div style={S.groupLabel}>{section.group}</div>
            <div style={S.btnRow}>
              {section.items.map((item) => (
                <button
                  key={item.insert}
                  style={getBtnStyle(activeTab, section.group)}
                  onClick={() => insertAtCursor(item.insert)}
                  title={`${item.name}\n→ inserts: ${item.insert}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
