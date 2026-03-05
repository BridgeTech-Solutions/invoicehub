import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { env } from '../config/env';

authenticator.options = {
  window: 1, // Tolérance d'1 intervalle (30s) pour compenser la dérive d'horloge
};

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function getTotpUri(email: string, secret: string): string {
  return authenticator.keyuri(email, env.TOTP_ISSUER, secret);
}

export async function generateQrCode(uri: string): Promise<string> {
  return QRCode.toDataURL(uri);
}

export function verifyTotpToken(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}
