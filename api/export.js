import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://hjizveuklymmobqzsglb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqaXp2ZXVrbHltbW9icXpzZ2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNTkyNjAsImV4cCI6MjA5MjczNTI2MH0.PRyNwCicqg1IaYe7-QlGIGmHljFpaYdel4tmLVGD5vU';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { project_id } = req.query;
  if (!project_id) return res.status(400).json({ error: 'project_id vereist' });

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: project } = await sb.from('risico_projecten').select('*').eq('id', project_id).single();
  const { data: risks } = await sb.from('risico_items').select('*').eq('project_id', project_id).order('volgnummer');

  if (!project || !risks) return res.status(404).json({ error: 'Project niet gevonden' });

  // Load template
  const templatePath = path.join(process.cwd(), 'template.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath);
  const ws = wb.getWorksheet('RISICOREGISTER');

  // Update project info
  ws.getCell('F1').value = project.naam || '';
  ws.getCell('F2').value = parseFloat(project.tsb) || 0;
  ws.getCell('F4').value = project.opsteller || '';
  ws.getCell('F5').value = project.datum_actualisatie || '';

  // Formula templates from row 12
  const F_RISICO_I  = `=IFERROR(Tabel2[[#This Row],[Kans]]*SUM(Tabel2[[#This Row],[Tijd]:[Omgeving]]),0)`;
  const F_KANS_PCT  = `=IFERROR(VLOOKUP(Tabel2[[#This Row],[Kans]],#REF!,9,0),0)`;
  const F_GELD_RW   = `=IFERROR(VLOOKUP(Tabel2[[#This Row],[Geld]],#REF!,12,0),0)`;
  const F_INIT_BEDRAG = `=Tabel2[[#This Row],[Kans ]]*Tabel2[[#This Row],[Geld ]]`;
  const F_RISICO_R  = `=IFERROR(Tabel2[[#This Row],[Kans  ]]*SUM(Tabel2[[#This Row],[Tijd  ]:[Omgeving  ]]),0)`;
  const F_KANS_R    = `=VLOOKUP(Tabel2[[#This Row],[Kans  ]],KWANTIFICEERTABELLEN!$B$19:$J$26,8,FALSE())`;
  const F_GELD_RW_R = `=IF(F$2<KWANTIFICEERTABELLEN!B$4,VLOOKUP(Tabel2[[#This Row],[Geld  ]],KWANTIFICEERTABELLEN!$B$6:$J$13,9,FALSE()),IF(AND(F$2>KWANTIFICEERTABELLEN!B$4,$F$2<KWANTIFICEERTABELLEN!B$30),VLOOKUP(Tabel2[[#This Row],[Geld  ]],KWANTIFICEERTABELLEN!$B$19:$J$26,9,FALSE()),IF(F$2>KWANTIFICEERTABELLEN!B$30,VLOOKUP(Tabel2[[#This Row],[Geld  ]],KWANTIFICEERTABELLEN!$B$32:$J$39,9,FALSE()),)))`;
  const F_BEDRAG_R  = `=IFERROR(Tabel2[[#This Row],[Kans   ]]*Tabel2[[#This Row],[Rekenwaarde kosten]],0)`;
  const F_TIJD_R    = `=IF(F$2<KWANTIFICEERTABELLEN!B$4,VLOOKUP(Tabel2[[#This Row],[Tijd  ]],KWANTIFICEERTABELLEN!$B$6:$D$13,3,FALSE()),IF(AND(F$2>KWANTIFICEERTABELLEN!B$4,$F$2<KWANTIFICEERTABELLEN!B$30),VLOOKUP(Tabel2[[#This Row],[Tijd  ]],KWANTIFICEERTABELLEN!$B$19:$D$26,3,FALSE()),IF(F$2>KWANTIFICEERTABELLEN!B$30,VLOOKUP(Tabel2[[#This Row],[Tijd  ]],KWANTIFICEERTABELLEN!$B$32:$D$39,3,FALSE()),)))`;

  // Clear existing data rows (12 onwards), keep first row for style reference
  const firstDataRow = 12;
  const lastRow = ws.rowCount;
  for (let r = firstDataRow + 1; r <= lastRow; r++) {
    ws.spliceRows(firstDataRow + 1, 1);
  }

  // Write data rows
  risks.forEach((r, idx) => {
    const rowNum = firstDataRow + idx;
    const row = idx === 0 ? ws.getRow(rowNum) : ws.insertRow(rowNum, [], 'i+');

    const s = (col, val) => { row.getCell(col).value = val; };

    s(2,  r.volgnummer || idx + 1);
    s(3,  r.deelproject || null);
    s(4,  r.gebeurtenis || '');
    s(5,  r.oorzaken || '');
    s(6,  r.gevolgen || '');
    s(7,  r.opmerking || null);
    s(8,  r.status || 'Concept');
    s(9,  r.eigenaar || null);
    s(10, r.allocatie || null);
    s(11, r.fase || null);
    // Initieel scores
    s(12, r.kans_i || null);
    s(13, r.tijd_i || null);
    s(14, r.geld_i || null);
    s(15, r.kwaliteit_i || null);
    s(16, r.veiligheid_i || null);
    s(17, r.omgeving_i || null);
    s(18, { formula: F_RISICO_I });
    s(19, { formula: F_KANS_PCT });
    s(20, { formula: F_GELD_RW });
    s(21, { formula: F_INIT_BEDRAG });
    // Beheersing
    s(22, r.beheersmaatregelen || '');
    s(23, r.actiehouder || null);
    s(24, null); // Status beheer
    s(25, r.toelichting || null);
    // Restrisico scores
    s(26, r.kans_r || null);
    s(27, r.tijd_r || null);
    s(28, r.geld_r || null);
    s(29, r.kwaliteit_r || null);
    s(30, r.veiligheid_r || null);
    s(31, r.omgeving_r || null);
    s(32, { formula: F_RISICO_R });
    s(33, { formula: F_KANS_R });
    s(34, { formula: F_GELD_RW_R });
    s(35, { formula: F_BEDRAG_R });
    s(36, { formula: F_TIJD_R });

    row.commit();
  });

  // Stream as download
  const naam = (project.naam || 'export').replace(/\s+/g,'_');
  const datum = new Date().toISOString().slice(0,10);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Risicodossier_${naam}_${datum}.xlsx"`);

  await wb.xlsx.write(res);
  res.end();
}
