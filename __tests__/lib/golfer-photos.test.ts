import { getGolferPhotoUrl, getGolferInitials } from '@/lib/golfer-photos';

describe('Golfer Photos', () => {
  test('returns URL for known golfers', () => {
    expect(getGolferPhotoUrl('Scottie Scheffler')).toBeTruthy();
    expect(getGolferPhotoUrl('Tiger Woods')).toBeTruthy();
    expect(getGolferPhotoUrl('Rory McIlroy')).toBeTruthy();
  });

  test('returns null for unknown golfers', () => {
    expect(getGolferPhotoUrl('Unknown Player')).toBeNull();
  });

  test('is case-insensitive', () => {
    expect(getGolferPhotoUrl('scottie scheffler')).toBeTruthy();
    expect(getGolferPhotoUrl('TIGER WOODS')).toBeTruthy();
  });

  test('all photo URLs are valid ESPN CDN URLs', () => {
    const known = ['Scottie Scheffler', 'Rory McIlroy', 'Tiger Woods', 'Jon Rahm', 'Jordan Spieth'];
    for (const name of known) {
      const url = getGolferPhotoUrl(name);
      expect(url).toMatch(/^https:\/\/a\.espncdn\.com\//);
    }
  });

  test('getGolferInitials returns correct initials', () => {
    expect(getGolferInitials('Scottie Scheffler')).toBe('SS');
    expect(getGolferInitials('Tiger Woods')).toBe('TW');
    expect(getGolferInitials('Rory McIlroy')).toBe('RM');
    expect(getGolferInitials('J.T. Poston')).toBe('JP');
  });

  test('initials are max 2 characters', () => {
    expect(getGolferInitials('Some Very Long Name Here').length).toBeLessThanOrEqual(2);
  });
});
