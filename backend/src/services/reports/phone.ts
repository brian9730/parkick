import { createCipheriv, createHmac, randomBytes } from 'node:crypto';

export interface StoredContact {
  contactPhoneCipher: Uint8Array<ArrayBuffer> | null;
  phoneEncryptionKeyVersion: string | null;
  phoneIdentifier: string | null;
  phoneHmacKeyVersion: string | null;
  contactPhoneMasked: string | null;
  consentVersion: string | null;
  consentedAt: Date | null;
}

/** Versioned envelope: 1 byte version, 12 byte nonce, 16 byte authentication tag, ciphertext. */
export function protectContact(phone: string | null, encryptionKey: Buffer, lookupKey: Buffer, now: Date): StoredContact {
  if (!phone) return {
    contactPhoneCipher: null, phoneEncryptionKeyVersion: null, phoneIdentifier: null,
    phoneHmacKeyVersion: null, contactPhoneMasked: null, consentVersion: null, consentedAt: null,
  };
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, nonce);
  cipher.setAAD(Buffer.from('parkick-contact-local-v1'));
  const encrypted = Buffer.concat([cipher.update(phone, 'utf8'), cipher.final()]);
  return {
    contactPhoneCipher: Buffer.concat([Buffer.from([1]), nonce, cipher.getAuthTag(), encrypted]),
    phoneEncryptionKeyVersion: 'local-v1',
    phoneIdentifier: createHmac('sha256', lookupKey).update(`parkick-phone-v1\0${phone}`).digest('hex'),
    phoneHmacKeyVersion: 'local-v1', contactPhoneMasked: `010-****-${phone.slice(-4)}`,
    consentVersion: 'phone-contact-v1', consentedAt: now,
  };
}
