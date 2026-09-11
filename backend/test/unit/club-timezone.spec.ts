import {
    addCalendarDays,
    calendarDayDistance,
    isoWeekday,
    localDateInZone,
    resolveLocalInstant,
} from '../../src/clubs/club-timezone';

describe('club recurring timezone policy', () => {
    it('skips a nonexistent local time during the spring DST gap', () => {
        expect(resolveLocalInstant('2026-03-29', '02:30', 'Europe/Berlin', 'EARLIER_OFFSET')).toBeNull();
    });

    it('selects the explicit earlier or later instant during the autumn overlap', () => {
        expect(resolveLocalInstant('2026-10-25', '02:30', 'Europe/Berlin', 'EARLIER_OFFSET')).toEqual({
            instant: new Date('2026-10-25T00:30:00.000Z'),
            offsetMinutes: 120,
        });
        expect(resolveLocalInstant('2026-10-25', '02:30', 'Europe/Berlin', 'LATER_OFFSET')).toEqual({
            instant: new Date('2026-10-25T01:30:00.000Z'),
            offsetMinutes: 60,
        });
    });

    it('resolves fixed and fractional offsets without using the server timezone', () => {
        expect(resolveLocalInstant('2026-09-11', '12:00', 'Europe/Moscow', 'EARLIER_OFFSET')).toEqual({
            instant: new Date('2026-09-11T09:00:00.000Z'),
            offsetMinutes: 180,
        });
        expect(resolveLocalInstant('2026-09-11', '12:00', 'Asia/Kathmandu', 'EARLIER_OFFSET')).toEqual({
            instant: new Date('2026-09-11T06:15:00.000Z'),
            offsetMinutes: 345,
        });
    });

    it('keeps calendar arithmetic deterministic around month and year boundaries', () => {
        expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(calendarDayDistance('2026-12-28', '2027-01-04')).toBe(7);
        expect(isoWeekday('2027-01-03')).toBe(7);
        expect(localDateInZone(new Date('2026-12-31T22:30:00.000Z'), 'Europe/Moscow')).toBe('2027-01-01');
    });
});
