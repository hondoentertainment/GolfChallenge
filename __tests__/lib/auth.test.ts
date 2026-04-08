jest.mock('@/lib/db', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  execute: jest.fn(),
}));

jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  })),
}));

import { queryOne, execute } from '@/lib/db';
import { createPasswordResetToken, resetPasswordWithToken } from '@/lib/auth';

const mockQueryOne = queryOne as jest.Mock;
const mockExecute = execute as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Password Reset', () => {
  test('createPasswordResetToken returns null for unknown email', async () => {
    mockQueryOne.mockResolvedValue(null);
    const token = await createPasswordResetToken('nonexistent@example.com');
    expect(token).toBeNull();
  });

  test('createPasswordResetToken returns token for valid email', async () => {
    mockQueryOne.mockResolvedValue({ id: 'user-1' });
    mockExecute.mockResolvedValue(undefined);
    const token = await createPasswordResetToken('test@example.com');
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token!.length).toBe(64); // 32 bytes hex
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  test('resetPasswordWithToken returns false for invalid token', async () => {
    mockQueryOne.mockResolvedValue(null);
    const result = await resetPasswordWithToken('bad-token', 'newpassword');
    expect(result).toBe(false);
  });

  test('resetPasswordWithToken updates password and invalidates token', async () => {
    mockQueryOne.mockResolvedValue({ user_id: 'user-1' });
    mockExecute.mockResolvedValue(undefined);
    const result = await resetPasswordWithToken('valid-token', 'newpassword');
    expect(result).toBe(true);
    // Should update password and mark token used (2 execute calls)
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });
});
