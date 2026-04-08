// Email module tests (without RESEND_API_KEY, emails are logged to console)
import { sendPasswordResetEmail, sendPickReminderEmail, sendWeeklyRecapEmail } from '@/lib/email';

describe('Email (dev mode - no API key)', () => {
  const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

  afterEach(() => consoleSpy.mockClear());
  afterAll(() => consoleSpy.mockRestore());

  test('sendPasswordResetEmail logs in dev mode', async () => {
    const result = await sendPasswordResetEmail('test@example.com', 'abc123');
    expect(result).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Password reset'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('abc123'));
  });

  test('sendPickReminderEmail logs in dev mode', async () => {
    const result = await sendPickReminderEmail('test@example.com', 'TestUser', 'Masters', 'Wed 6pm');
    expect(result).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Pick reminder'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Masters'));
  });

  test('sendWeeklyRecapEmail logs in dev mode', async () => {
    const result = await sendWeeklyRecapEmail('test@example.com', 'TestUser', '<h1>Recap</h1>');
    expect(result).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Weekly recap'));
  });
});
