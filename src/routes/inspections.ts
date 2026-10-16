// 出機檢測表：一張訂單一份（GET 沒有存過就給一份草稿，PUT 存起來）。
import { Router, type Request, type Response } from '../lib/router';
import { defaultChecks, defaultStress, DEFAULT_NOTES, normalizeInspection, type Inspection } from '../lib/inspection';
import { SPEC_FIELDS, specsFromItems } from '../lib/specs';
import pool, { taipeiDate } from '../models/database';

const router = new Router();

const toRow = (r: any): Inspection => ({
  reportNo: r.report_no,
  testDate: r.test_date,
  clientName: r.client_name,
  machineSpec: r.machine_spec,
  osVersion: r.os_version,
  tester: r.tester,
  ambientTemp: r.ambient_temp,
  stress: JSON.parse(r.stress || '[]'),
  checks: JSON.parse(r.checks || '[]'),
  conclusion: r.conclusion,
  notes: r.notes,
});

router.get('/:id/inspection', async (req: Request, res: Response) => {
  const qId = parseInt(req.params.id as string);
  const [{ rows: [q] }, { rows: items }, { rows: [saved] }] = await pool.batch([
    ['SELECT id, quotation_no, customer_name, ship_date FROM quotations WHERE id = $1', [qId]],
    ['SELECT category, name, spec, quantity FROM quotation_items WHERE quotation_id = $1 ORDER BY id', [qId]],
    ['SELECT * FROM inspections WHERE quotation_id = $1', [qId]],
  ]);
  if (!q) return res.status(404).json({ error: '找不到訂單' });
  if (saved) return res.json({ saved: true, updatedAt: saved.updated_at, report: toRow(saved) });

  // 還沒存過：用訂單內容帶一份草稿
  const specs = await specsFromItems(items as any);
  const machineSpec = SPEC_FIELDS.filter((f) => specs[f.key]).map((f) => `${f.label}：${specs[f.key]}`).join('\n');
  const date = (q.ship_date || taipeiDate()).slice(0, 10);
  const report: Inspection = {
    reportNo: `QC-${date.replace(/-/g, '')}-${String(q.id).padStart(6, '0')}`,
    testDate: taipeiDate().replace(/-/g, '/'),
    clientName: q.customer_name || '',
    machineSpec,
    osVersion: 'Windows 11',
    tester: req.user?.displayName || '',
    ambientTemp: 26,
    stress: defaultStress(),
    checks: defaultChecks(),
    conclusion: 'pass',
    notes: DEFAULT_NOTES,
  };
  res.json({ saved: false, report });
});

router.put('/:id/inspection', async (req: Request, res: Response) => {
  const qId = parseInt(req.params.id as string);
  const { rows: [q] } = await pool.query('SELECT id FROM quotations WHERE id = $1', [qId]);
  if (!q) return res.status(404).json({ error: '找不到訂單' });
  const r = normalizeInspection(req.body);
  await pool.query(
    `INSERT INTO inspections (quotation_id, report_no, test_date, client_name, machine_spec, os_version, tester, ambient_temp, stress, checks, conclusion, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (quotation_id) DO UPDATE SET
       report_no = excluded.report_no, test_date = excluded.test_date, client_name = excluded.client_name,
       machine_spec = excluded.machine_spec, os_version = excluded.os_version, tester = excluded.tester,
       ambient_temp = excluded.ambient_temp, stress = excluded.stress, checks = excluded.checks,
       conclusion = excluded.conclusion, notes = excluded.notes, updated_at = NOW()`,
    [qId, r.reportNo, r.testDate, r.clientName, r.machineSpec, r.osVersion, r.tester, r.ambientTemp,
      JSON.stringify(r.stress), JSON.stringify(r.checks), r.conclusion, r.notes],
  );
  res.json({ success: true });
});

export default router;
