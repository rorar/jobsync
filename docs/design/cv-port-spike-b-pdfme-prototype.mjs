// Spike B reference prototype — KNOWN-GOOD pdfme CV render (ROADMAP 4.2.2)
// ---------------------------------------------------------------------------
// This is a REFERENCE artifact, NOT wired into the JobSync build. It is the
// validated minimal pdfme template that the Spike B verdict (GO) is based on.
// Findings doc: docs/design/cv-port-spike-b-pdfme-fidelity.md
//
// Run standalone:
//   mkdir /tmp/pdfme-ref && cd /tmp/pdfme-ref
//   echo '{"type":"module"}' > package.json
//   npm i @pdfme/generator @pdfme/schemas
//   cp <this file> spike.mjs && node spike.mjs   # → out.pdf (2-page A4)
//
// Encodes the 5 gotchas future agents MUST respect:
//  1. Object basePdf { width, height, padding } is MANDATORY for pagination.
//     BLANK_PDF / a custom background PDF DISABLES page-breaks + re-layout.
//  2. Build table schemas by spreading table.propPanel.defaultSchema — raw
//     hand-authored styles crash (undefined `alignment` / `padding.right`).
//     In production, author templates via @pdfme/ui Designer, store JSON.
//  3. The branch-curve timeline is an EMBEDDED SVG (vector) — we generate the
//     SVG server-side (same as the report Sankey); pdfme does not draw it.
//  4. Register the Inter font via the generator `font` option for real typo
//     (default is Roboto/Helvetica) — omitted here, add for production.
//  5. Layout is coordinate/Stack, not CSS flow → the cv-manager look is a
//     REBUILD in pdfme's model, not a 1:1 HTML/CSS port.
// ---------------------------------------------------------------------------

import { generate } from '@pdfme/generator';
import { text, table, svg, image, line, rectangle, multiVariableText, builtInPlugins } from '@pdfme/schemas';

// Branch-curve timeline (mirrors cv-manager computeTimelineBranches output):
// main line + one forked parallel-role branch via cubic beziers + node dots.
// In production this string is produced by our server-side timeline generator
// from CvDocument.data (JSON Resume), exactly like the report Sankey SVG.
const timelineSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 90">
<line x1="10" y1="45" x2="510" y2="45" stroke="#0066ff" stroke-width="3"/>
<path d="M180 45 C 210 45, 215 18, 250 18 L 360 18 C 395 18, 400 45, 430 45" fill="none" stroke="#00a3ff" stroke-width="3"/>
<circle cx="60" cy="45" r="7" fill="#0066ff"/><circle cx="305" cy="18" r="7" fill="#00a3ff"/><circle cx="430" cy="45" r="7" fill="#0066ff"/></svg>`;

// Gotcha #2: spread the canonical default table schema, then override.
const tableBase = JSON.parse(JSON.stringify(table.propPanel.defaultSchema));
const expTable = {
  ...tableBase, name: 'exp', position: { x: 15, y: 72 }, width: 180, height: 40,
  head: ['Role', 'Company', 'Period'], headWidthPercentages: [45, 35, 20],
};
expTable.headStyles.backgroundColor = '#0066ff';
expTable.headStyles.fontSize = 9;
expTable.bodyStyles.fontSize = 8;

const template = {
  // Gotcha #1: object basePdf (A4 mm) — enables re-layout + page-breaks.
  basePdf: { width: 210, height: 297, padding: [15, 15, 15, 15] },
  schemas: [[
    { name: 'name', type: 'text', position: { x: 15, y: 15 }, width: 120, height: 10, fontSize: 22, fontColor: '#001a4d' },
    { name: 'headline', type: 'multiVariableText', position: { x: 15, y: 27 }, width: 180, height: 8, fontSize: 11, fontColor: '#0066ff', text: '{title} — {subtitle}', variables: ['title', 'subtitle'] },
    { name: 'timeline', type: 'svg', position: { x: 15, y: 38 }, width: 180, height: 30 },
    expTable,
  ]],
};

// 28 experience rows → forces multi-page pagination (proves it works).
const rows = Array.from({ length: 28 }, (_, i) => [
  `Role ${i + 1} — long descriptive title that should wrap across multiple lines in the cell`,
  `Company ${i + 1} AG`,
  `20${10 + (i % 14)}–20${11 + (i % 14)}`,
]);

const inputs = [{
  name: 'Marcus Chen',
  headline: JSON.stringify({ title: 'Cloud Solutions Architect', subtitle: 'AWS & Azure | DevOps' }),
  timeline: timelineSVG,
  exp: JSON.stringify(rows),
}];

const plugins = { text, multiVariableText, svg, table, image, line, rectangle, ...builtInPlugins };

const pdf = await generate({ template, inputs, plugins });
const { writeFileSync } = await import('fs');
writeFileSync('out.pdf', pdf);
console.log('OK in-process | bytes:', pdf.length, '| header:', Buffer.from(pdf.slice(0, 5)).toString());
// Verified: %PDF-, 2 pages, A4 595×842pt — see spike doc.
