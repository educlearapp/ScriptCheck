import bcrypt from "bcryptjs";

export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashAuthPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function compareAuthPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
