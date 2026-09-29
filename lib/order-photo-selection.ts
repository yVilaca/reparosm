export const MAX_ORDER_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_ORDER_PHOTOS = 5;

const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function addOrderPhotoSelection(current: File[], selected: File[]) {
  if (current.length + selected.length > MAX_ORDER_PHOTOS)
    return { error: 'Você pode anexar no máximo 5 fotos por ordem.' } as const;
  if (selected.some((file) => !acceptedTypes.has(file.type)))
    return { error: 'Selecione imagens JPG, PNG ou WebP.' } as const;
  if (selected.some((file) => !file.size || file.size > MAX_ORDER_PHOTO_BYTES))
    return { error: 'Cada foto deve ter até 8 MB.' } as const;
  return { files: [...current, ...selected] } as const;
}
