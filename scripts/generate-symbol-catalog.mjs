/** Rebuild the point-symbol catalog from milsymbol's own upstream standard tables.
 * Only symbols actually rendered by the installed milsymbol are exposed. */
import fs from 'node:fs';
import ms from 'milsymbol';
import modern from 'milstandard-e';
import nato from 'stanag-app6';

const standards = [
  ['2525E', 'MIL-STD-2525E', modern.ms2525e, '2525', '13'],
  ['APP6D', 'APP-6D', nato.app6d, 'APP6', '10'],
];
const symbols = [];
const omitted = [];
const seen = new Set();
function add(id, standard, group, label, sidc, echelon, remark = '') {
  const key = `${id}:${sidc}`;
  if (seen.has(key)) return;
  seen.add(key);
  // Check both affiliations; unsupported codes otherwise silently draw generic frames.
  const enemy = /^\d/.test(sidc) ? sidc.slice(0, 3) + '6' + sidc.slice(4) : sidc[0] + 'H' + sidc.slice(2);
  const valid = [sidc, enemy].every(code => {
    try {
      const symbol = new ms.Symbol(code, { standard, size: 30 });
      return symbol.isValid() === true && !/NaN|Infinity/.test(symbol.asSVG());
    } catch { return false; }
  });
  if (!valid) { omitted.push({ standard: id, label, sidc }); return; }
  symbols.push({ id: `catalog:${id}:${sidc}`, label, category: group, standardId: id, standard, sidc, supportsEchelon: echelon, remarks: remark });
}
for (const [id, , data, standard, version] of standards) {
  for (const [set, group] of Object.entries(data)) {
    if (!/^\d{2}$/.test(set)) continue;
    for (const row of group.mainIcon ?? []) {
      if (!/^\d{6}$/.test(row.Code)) continue;
      const label = [...new Set([row.Entity, row['Entity Type'], row['Entity Subtype']].map(x => x?.trim()).filter(Boolean))].join(' / ');
      add(id, standard, group.name.trim(), label, `${version}03${set}0000${row.Code}0000`, set === '10', row.Remarks?.trim());
    }
  }
}
const rank = new Map(standards.map(([id], index) => [id, index]));
const groups = ['Land unit', 'Land equipment', 'Air', 'Sea surface', 'Sea subsurface', 'Space'];
symbols.sort((a,b) => rank.get(a.standardId) - rank.get(b.standardId) || (groups.includes(a.category) ? groups.indexOf(a.category) : 99) - (groups.includes(b.category) ? groups.indexOf(b.category) : 99) || a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
const payload = { milsymbolVersion: ms.version, standards: standards.map(([id,label]) => ({id,label})), symbols };
fs.writeFileSync(new URL('../src/features/simulation/data/symbolCatalog.json', import.meta.url), JSON.stringify(payload) + '\n');
fs.writeFileSync(new URL('./symbol-catalog-omissions.json', import.meta.url), JSON.stringify(omitted, null, 2) + '\n');
console.log(`Catalog: ${symbols.length} supported standard entries; ${omitted.length} unsupported entries omitted.`);
for(const [id] of standards) console.log(id, symbols.filter(s => s.standardId === id).length);
