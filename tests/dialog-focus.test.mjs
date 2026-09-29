import assert from 'node:assert/strict';
import test from 'node:test';

const dialogModule = await import('../components/ui/dialog.tsx');

test('dialog close restores focus to the element active before opening', () => {
  assert.equal(typeof dialogModule.restoreDialogFocus, 'function');

  let focusCalls = 0;
  const event = {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };

  dialogModule.restoreDialogFocus(event, { focus: () => focusCalls++ });

  assert.equal(focusCalls, 1);
  assert.equal(event.defaultPrevented, true);
});

test('dialog close preserves an existing autofocus handler and tolerates no target', () => {
  let focusCalls = 0;
  const event = {
    defaultPrevented: true,
    preventDefault() {
      throw new Error('an existing handler already handled focus');
    },
  };

  dialogModule.restoreDialogFocus(event, { focus: () => focusCalls++ });
  dialogModule.restoreDialogFocus({ defaultPrevented: false, preventDefault() {} }, null);

  assert.equal(focusCalls, 0);
});
