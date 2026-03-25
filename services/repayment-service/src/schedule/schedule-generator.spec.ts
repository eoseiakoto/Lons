import { generateEMISchedule, generateReducingBalanceSchedule, generateLumpSumSchedule, generateBalloonSchedule } from './schedule-generator';
import { add as decAdd } from '@lons/common';

describe('ScheduleGenerator', () => {
  const baseParams = {
    principalAmount: '10000.0000',
    interestRate: '12.0000',
    tenorDays: 180,
    startDate: new Date('2026-01-01'),
  };

  describe('generateEMISchedule', () => {
    it('should generate correct number of installments', () => {
      const schedule = generateEMISchedule(baseParams);
      expect(schedule.length).toBe(6); // 180 days / 30 = 6 months
    });

    it('should have principal portions summing to original principal', () => {
      const schedule = generateEMISchedule(baseParams);
      let totalPrincipal = '0.0000';
      for (const entry of schedule) {
        totalPrincipal = decAdd(totalPrincipal, entry.principalAmount);
      }
      expect(Number(totalPrincipal)).toBeCloseTo(10000, 0);
    });

    it('should have dates in ascending order', () => {
      const schedule = generateEMISchedule(baseParams);
      for (let i = 1; i < schedule.length; i++) {
        expect(schedule[i].dueDate.getTime()).toBeGreaterThan(schedule[i - 1].dueDate.getTime());
      }
    });

    it('should have all positive amounts', () => {
      const schedule = generateEMISchedule(baseParams);
      for (const entry of schedule) {
        expect(Number(entry.totalAmount)).toBeGreaterThan(0);
        expect(Number(entry.principalAmount)).toBeGreaterThanOrEqual(0);
        expect(Number(entry.interestAmount)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('generateReducingBalanceSchedule', () => {
    it('should have declining total payments', () => {
      const schedule = generateReducingBalanceSchedule(baseParams);
      for (let i = 1; i < schedule.length; i++) {
        expect(Number(schedule[i].totalAmount)).toBeLessThanOrEqual(Number(schedule[i - 1].totalAmount) + 0.01);
      }
    });
  });

  describe('generateLumpSumSchedule', () => {
    it('should have exactly one entry', () => {
      const schedule = generateLumpSumSchedule(baseParams);
      expect(schedule.length).toBe(1);
      expect(Number(schedule[0].principalAmount)).toBe(10000);
      expect(Number(schedule[0].interestAmount)).toBeGreaterThan(0);
    });
  });

  describe('generateBalloonSchedule', () => {
    it('should have interest-only payments except last', () => {
      const schedule = generateBalloonSchedule(baseParams);
      for (let i = 0; i < schedule.length - 1; i++) {
        expect(schedule[i].principalAmount).toBe('0.0000');
      }
      const last = schedule[schedule.length - 1];
      expect(Number(last.principalAmount)).toBe(10000);
    });
  });
});
