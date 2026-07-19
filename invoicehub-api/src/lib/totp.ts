import * as otplib from 'otplib';
// qrcode est un module CommonJS sans export `default` : avec `esModuleInterop`
// désactivé (cf. tsconfig), `import { default as QRCode }` compile en
// `qrcode_1.default` === undefined et fait planter generateQrCode() à l'exécution.
import * as QRCode from 'qrcode';

const authenticator = (otplib as any).authenticator ?? (otplib as any).default?.authenticator;

if (authenticator?.options) {
  authenticator.options = { window: 1 };
}

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function getTotpUri(email: string, secret: string): string {
  const issuer = process.env.TOTP_ISSUER ?? 'InvoiceHub BTS';
  return authenticator.keyuri(email, issuer, secret);
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
