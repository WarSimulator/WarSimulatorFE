import fs from 'node:fs';
// mil-sym-ts 2.10.4 produces one shape for Infiltration, then unconditionally
// accesses a second arrowhead while styling. Keep its generated geometry and
// skip only the nonexistent separate arrowhead. Apply reproducibly on install.
const path = new URL('../node_modules/@armyc2.c5isr.renderer/mil-sym-ts-web/C5Ren.mjs', import.meta.url);
const source = fs.readFileSync(path, 'utf8');
const start = source.indexOf('else if (tg.get_LineType() === TacticalLines.DIRATKGND || tg.get_LineType() === TacticalLines.DIRATKSPT || tg.get_LineType() == TacticalLines.EXPLOIT || lineType == TacticalLines.INFILTRATION)');
if (start < 0) throw new Error('Renderer changed: review the Infiltration compatibility patch.');
const end = source.indexOf('} else if', start);
const block = source.slice(start, end);
if (!block.includes('if (arrowHeadShape)')) {
  const patched = block.replace('let arrowHeadShape = shapes[1];', 'let arrowHeadShape = shapes[1];\n\t\t\t\tif (arrowHeadShape) {') + '\n\t\t\t\t}';
  fs.writeFileSync(path, source.slice(0, start) + patched + source.slice(end));
}
