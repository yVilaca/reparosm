'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import {
  formatCurrencyInput,
  formatCurrencyOrPercentInput,
  formatDocumentInput,
  formatIntegerInput,
  formatPhoneInput,
  formatSignedIntegerInput,
} from '@/lib/input-masks';

export type InputMask =
  'phone' | 'document' | 'currency' | 'currency-percent' | 'integer' | 'signed-integer';

const formatters: Record<InputMask, (value: unknown) => string> = {
  phone: formatPhoneInput,
  document: formatDocumentInput,
  currency: formatCurrencyInput,
  'currency-percent': formatCurrencyOrPercentInput,
  integer: formatIntegerInput,
  'signed-integer': formatSignedIntegerInput,
};

const inputModes: Record<InputMask, React.HTMLAttributes<HTMLInputElement>['inputMode']> = {
  phone: 'tel',
  document: 'numeric',
  currency: 'decimal',
  'currency-percent': 'decimal',
  integer: 'numeric',
  'signed-integer': 'numeric',
};

type MaskedInputProps = Omit<
  React.ComponentProps<typeof Input>,
  'defaultValue' | 'type' | 'value'
> & {
  mask: InputMask;
  value?: string | number;
  defaultValue?: string | number;
};

const MaskedInput = React.forwardRef<HTMLInputElement, MaskedInputProps>(function MaskedInput(
  { defaultValue, mask, onChange, inputMode, value, ...props },
  ref,
) {
  const format = formatters[mask];
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const typed = input.value;
    const caret = input.selectionStart ?? typed.length;
    const formatted = format(typed);
    if (formatted !== typed) {
      input.value = formatted;
      const nextCaret = format(typed.slice(0, caret)).length;
      queueMicrotask(() => {
        if (document.activeElement === input) input.setSelectionRange(nextCaret, nextCaret);
      });
    }
    onChange?.(event);
  };

  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode={inputMode || inputModes[mask]}
      defaultValue={defaultValue === undefined ? undefined : format(defaultValue)}
      onChange={handleChange}
      value={value === undefined ? undefined : format(value)}
    />
  );
});

export { MaskedInput };
