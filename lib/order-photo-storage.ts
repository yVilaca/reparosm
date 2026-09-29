import { MAX_ORDER_PHOTO_BYTES, MAX_ORDER_PHOTOS } from '@/lib/order-photo-selection';

export { MAX_ORDER_PHOTO_BYTES, MAX_ORDER_PHOTOS };

export function detectOrderPhotoType(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { contentType: 'image/jpeg' } as const;
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return { contentType: 'image/png' } as const;
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
    return { contentType: 'image/webp' } as const;
  return null;
}
