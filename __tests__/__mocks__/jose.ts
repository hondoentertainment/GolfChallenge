export class SignJWT {
  constructor(private payload: Record<string, unknown>) {}
  setProtectedHeader() { return this; }
  setIssuedAt() { return this; }
  setExpirationTime() { return this; }
  async sign() { return 'mock-jwt-token'; }
}

export async function jwtVerify() {
  return { payload: { sub: 'mock-user-id' } };
}
