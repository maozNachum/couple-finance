import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { SignedAmountInput } from './SignedAmountInput';

it('edits the sign without rounding, submitting or replacing the draft on rerender', async () => {
  const user = userEvent.setup();
  const view = render(<SignedAmountInput name="amount" label="סכום" signLabel="החלפת סימן" />);
  const input = screen.getByLabelText('סכום');
  await user.type(input, '123456789.12345678');
  await user.click(screen.getByRole('button', { name: 'החלפת סימן' }));
  expect(input).toHaveValue('-123456789.12345678');
  view.rerender(<SignedAmountInput name="amount" label="סכום" signLabel="החלפת סימן" defaultValue="99" />);
  expect(input).toHaveValue('-123456789.12345678');
  await user.click(screen.getByRole('button', { name: 'החלפת סימן' }));
  expect(input).toHaveValue('123456789.12345678');
  expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
});
