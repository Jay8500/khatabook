import { initials } from './avatar';

describe('initials', () => {
  it('uses the first letter of one word', () => {
    expect(initials('Jay')).toBe('J');
    expect(initials('jay')).toBe('J');
  });

  it('uses the first letters of the first two words', () => {
    expect(initials('Jaya Krishna')).toBe('JK');
    expect(initials('jaya_krishna')).toBe('JK');
    expect(initials('jaya.krishna')).toBe('JK');
    expect(initials('Jaya Krishna Lakkoju')).toBe('JK');
  });

  it('ignores extra spaces and handles empty names', () => {
    expect(initials('  Jaya   Krishna ')).toBe('JK');
    expect(initials('')).toBe('');
    expect(initials(null)).toBe('');
  });
});
