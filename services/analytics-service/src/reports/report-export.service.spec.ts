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
  });
});
