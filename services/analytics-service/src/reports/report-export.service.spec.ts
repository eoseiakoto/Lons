import { ReportExportService, ReportColumn } from './report-export.service';

describe('ReportExportService', () => {
  let svc: ReportExportService;

  beforeEach(() => {
    svc = new ReportExportService({} as never);
  });

  describe('generateCsv', () => {
    it('emits a UTF-8 BOM prefix', () => {
      const cols: ReportColumn[] = [{ key: 'name', label: 'Name' }];
      const buf = svc.generateCsv(cols, [{ name: 'Ama' }]);
      expect(buf[0]).toBe(0xef);
      expect(buf[1]).toBe(0xbb);
      expect(buf[2]).toBe(0xbf);
    });

    it('quotes values containing commas, quotes, or newlines', () => {
      const cols: ReportColumn[] = [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ];
      const rows = [{ a: 'has,comma', b: 'has "quote"' }, { a: 'plain', b: 'line\nbreak' }];
      const csv = svc.generateCsv(cols, rows).toString('utf-8').replace(/^﻿/, ''); // strip BOM
      const lines = csv.split('\r\n');
      expect(lines[1]).toContain('"has,comma"');
      expect(lines[1]).toContain('"has ""quote"""');
      expect(lines[2]).toContain('"line\nbreak"');
    });

    it('preserves money values as strings (no float conversion)', () => {
      const cols: ReportColumn[] = [{ key: 'amount', label: 'Amount', format: 'money' }];
      const buf = svc.generateCsv(cols, [{ amount: '1234567890.1234' }]);
      expect(buf.toString('utf-8')).toContain('1234567890.1234');
    });

    it('formats date and datetime columns to ISO', () => {
      const date = new Date('2026-05-17T12:34:56.000Z');
      const cols: ReportColumn[] = [
        { key: 'd', label: 'D', format: 'date' },
        { key: 'dt', label: 'DT', format: 'datetime' },
      ];
      const buf = svc.generateCsv(cols, [{ d: date, dt: date }]);
      const csv = buf.toString('utf-8');
      expect(csv).toContain('2026-05-17');
      expect(csv).toContain('2026-05-17T12:34:56.000Z');
    });

    it('handles empty dataset with header only', () => {
      const cols: ReportColumn[] = [{ key: 'x', label: 'X' }];
      const csv = svc.generateCsv(cols, []).toString('utf-8').replace(/^﻿/, '');
      expect(csv).toBe('X\r\n');
    });

    it('renders null/undefined cells as empty string', () => {
      const cols: ReportColumn[] = [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ];
      const csv = svc.generateCsv(cols, [{ a: null, b: undefined }]).toString('utf-8');
      expect(csv).toContain('\r\n,\r\n');
    });

    it('appends percent suffix for percent-format columns', () => {
      const cols: ReportColumn[] = [{ key: 'rate', label: 'Rate', format: 'percent' }];
      const csv = svc.generateCsv(cols, [{ rate: 12.5 }]).toString('utf-8');
      expect(csv).toContain('12.5%');
    });

    it('truncates int columns to integer', () => {
      const cols: ReportColumn[] = [{ key: 'n', label: 'N', format: 'int' }];
      const csv = svc.generateCsv(cols, [{ n: 12.9 }]).toString('utf-8');
      expect(csv).toContain('\r\n12\r\n');
    });

    it('FIX-BA-3: formats large integer values without precision loss', () => {
      // Number.MAX_SAFE_INTEGER + 2 — once a value crosses the IEEE-754
      // safe-integer boundary, `Number(...)` rounds to the nearest
      // representable double. The old `String(Math.trunc(Number(value)))`
      // path lost the low bits ('...992' instead of '...993'). The new
      // `parseInt(String(value), 10)` path keeps the exact integer.
      const cols: ReportColumn[] = [{ key: 'n', label: 'N', format: 'int' }];
      const csv = svc
        .generateCsv(cols, [{ n: '9007199254740993' }])
        .toString('utf-8');
      expect(csv).toContain('\r\n9007199254740993\r\n');
      // Sanity check: Number() would have produced 9007199254740992.
      expect(csv).not.toContain('9007199254740992');
    });
  });

  describe('generatePdf (Sprint 18 follow-up)', () => {
    // Smallest verifiable contract: the method resolves with a real
    // PDF buffer. We don't snapshot the bytes (PDFKit timestamps the
    // /CreationDate metadata, so the output is non-deterministic)
    // but we can verify magic bytes + non-trivial size + the
    // standard PDF trailer marker.

    const sample = {
      title: 'Disbursement Report',
      subtitle: 'Jan 2026',
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'amount', label: 'Amount' },
        { key: 'currency', label: 'Currency' },
      ],
      rows: [
        { date: '2026-01-15', amount: '1500.0000', currency: 'GHS' },
        { date: '2026-01-16', amount: '2750.5000', currency: 'GHS' },
      ],
    };

    it('returns a valid PDF buffer starting with %PDF- magic bytes', async () => {
      const buf = await svc.generatePdf(sample);

      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(buf.length).toBeGreaterThan(500); // PDFKit base output ~> 1 KB
      // Magic bytes — every PDF starts with %PDF-
      expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      // Trailer marker — every PDF ends with %%EOF on the last line.
      expect(buf.subarray(-7).toString('ascii').trim()).toBe('%%EOF');
    });

    it('handles an empty rows array (header-only PDF still valid)', async () => {
      const buf = await svc.generatePdf({ ...sample, rows: [] });
      expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(buf.length).toBeGreaterThan(500);
    });

    it('paginates when row count would overflow a single page', async () => {
      // ~120 rows at 8pt font with 0.4 line-down per row on A4
      // landscape definitely triggers the doc.addPage() branch.
      const many = Array.from({ length: 120 }, (_, i) => ({
        date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
        amount: `${100 + i}.0000`,
        currency: 'GHS',
      }));
      const buf = await svc.generatePdf({ ...sample, rows: many });
      expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      // /Count entry in /Pages is "/Count N" where N >= 2 for a
      // paginated doc. Cheaper than parsing the cross-ref table.
      const text = buf.toString('latin1');
      const countMatch = text.match(/\/Count (\d+)/);
      expect(countMatch).not.toBeNull();
      expect(Number(countMatch![1])).toBeGreaterThanOrEqual(2);
    });
  });
});
