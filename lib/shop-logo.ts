export const SHOP_LOGO_UPLOAD_PATH = '/api/shops/logo';
export const PUBLIC_SHOP_LOGO_PATH = '/api/public/shops/logo';
export const MAX_SHOP_LOGO_BYTES = 1024 * 1024;
export const MAX_SHOP_LOGO_DIMENSION = 2048;

export type ShopLogoContentType = 'image/png' | 'image/jpeg' | 'image/webp';
export type ShopLogoInfo = {
  contentType: ShopLogoContentType;
  width: number;
  height: number;
};

const text = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.slice(offset, offset + length));

const uint16be = (bytes: Uint8Array, offset: number) => (bytes[offset] << 8) | bytes[offset + 1];

const uint16le = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8);

const uint24le = (bytes: Uint8Array, offset: number) =>
  bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);

const uint32be = (bytes: Uint8Array, offset: number) =>
  bytes[offset] * 0x1000000 +
  (bytes[offset + 1] << 16) +
  (bytes[offset + 2] << 8) +
  bytes[offset + 3];

const uint32le = (bytes: Uint8Array, offset: number) =>
  bytes[offset] +
  (bytes[offset + 1] << 8) +
  (bytes[offset + 2] << 16) +
  bytes[offset + 3] * 0x1000000;

const bounded = (width: number, height: number) =>
  width > 0 &&
  height > 0 &&
  width <= MAX_SHOP_LOGO_DIMENSION &&
  height <= MAX_SHOP_LOGO_DIMENSION &&
  width * height <= MAX_SHOP_LOGO_DIMENSION * MAX_SHOP_LOGO_DIMENSION;

const png = (bytes: Uint8Array): ShopLogoInfo | null => {
  if (
    bytes.length < 24 ||
    ![0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    ) ||
    uint32be(bytes, 8) !== 13 ||
    text(bytes, 12, 4) !== 'IHDR'
  )
    return null;
  const width = uint32be(bytes, 16);
  const height = uint32be(bytes, 20);
  return bounded(width, height) ? { contentType: 'image/png', width, height } : null;
};

const jpeg = (bytes: Uint8Array): ShopLogoInfo | null => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset++] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (marker === 0x01) continue;
    if (offset + 2 > bytes.length) return null;
    const length = uint16be(bytes, offset);
    if (length < 2 || offset + length > bytes.length) return null;
    const frame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (frame) {
      if (length < 7) return null;
      const height = uint16be(bytes, offset + 3);
      const width = uint16be(bytes, offset + 5);
      return bounded(width, height) ? { contentType: 'image/jpeg', width, height } : null;
    }
    offset += length;
  }
  return null;
};

const webp = (bytes: Uint8Array): ShopLogoInfo | null => {
  if (bytes.length < 20 || text(bytes, 0, 4) !== 'RIFF' || text(bytes, 8, 4) !== 'WEBP')
    return null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const kind = text(bytes, offset, 4);
    const length = uint32le(bytes, offset + 4);
    const payload = offset + 8;
    if (payload + length > bytes.length) return null;
    if (kind === 'VP8X' && length >= 10) {
      const width = 1 + uint24le(bytes, payload + 4);
      const height = 1 + uint24le(bytes, payload + 7);
      return bounded(width, height) ? { contentType: 'image/webp', width, height } : null;
    }
    if (kind === 'VP8 ' && length >= 12 && bytes[payload + 6] === 0x9d) {
      const width = uint16le(bytes, payload + 8) & 0x3fff;
      const height = uint16le(bytes, payload + 10) & 0x3fff;
      return bounded(width, height) ? { contentType: 'image/webp', width, height } : null;
    }
    if (kind === 'VP8L' && length >= 5 && bytes[payload] === 0x2f) {
      const width = 1 + (bytes[payload + 1] | ((bytes[payload + 2] & 0x3f) << 8));
      const height =
        1 +
        ((bytes[payload + 2] >> 6) |
          (bytes[payload + 3] << 2) |
          ((bytes[payload + 4] & 0x0f) << 10));
      return bounded(width, height) ? { contentType: 'image/webp', width, height } : null;
    }
    offset = payload + length + (length % 2);
  }
  return null;
};

export function inspectShopLogo(bytes: Uint8Array): ShopLogoInfo | null {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_SHOP_LOGO_BYTES) return null;
  return png(bytes) || jpeg(bytes) || webp(bytes);
}
