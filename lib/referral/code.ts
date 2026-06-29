import { randomBytes } from 'crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Генерирует уникальный 8-символьный код (буквы + цифры, uppercase)
export function generateReferralCode(userId: string): string {
  void userId;
  const seed = randomBytes(8);
  let value = '';

  for (let index = 0; index < 8; index += 1) {
    value += ALPHABET[seed[index] % ALPHABET.length];
  }

  return `${value.slice(0, 4)}-${value.slice(4, 8)}`;
}
