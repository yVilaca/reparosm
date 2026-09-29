/** @typedef {{ id: number, message: string, resolve: (confirmed: boolean) => void }} Confirmation */

/** @param {(pending: Confirmation | null) => void} onChange */
export function createConfirmationQueue(onChange) {
  /** @type {Confirmation | null} */
  let current = null;
  /** @type {Confirmation[]} */
  const queued = [];
  let nextId = 0;

  return {
    enqueue(message, resolve) {
      const entry = { id: ++nextId, message, resolve };
      if (current) queued.push(entry);
      else {
        current = entry;
        onChange(current);
      }
      return entry.id;
    },
    resolve(id, confirmed) {
      if (current?.id !== id) return;
      const resolved = current;
      current = queued.shift() ?? null;
      onChange(current);
      resolved.resolve(confirmed);
    },
  };
}
