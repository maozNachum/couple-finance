import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from './router';

describe('application shell', () => {
  it('shows an honest foundation state and working navigation', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AppRoutes /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: 'טוב להיות באותו עמוד.' })).toBeInTheDocument();
    expect(screen.getByText(/אין חשבונות מחוברים/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'הבית שלנו' })).toHaveAttribute('aria-current', 'page');
    await user.click(screen.getByRole('link', { name: 'על המרחב' }));
    expect(screen.getByRole('heading', { level: 1, name: 'הבית הפיננסי שלנו.' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveFocus();
    expect(screen.getByRole('link', { name: 'על המרחב' })).toHaveAttribute('aria-current', 'page');
  });
  it('provides a useful unknown-route state', () => {
    render(<MemoryRouter initialEntries={['/missing']}><AppRoutes /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: 'העמוד הזה לא נמצא.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'חזרה לבית שלנו' })).toHaveAttribute('href', '/');
  });
});
