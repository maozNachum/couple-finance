import { CategoriesPage } from '@/pages/categories/CategoriesPage';
import { Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/shared/layout/AppLayout';
import { HomePage } from '@/pages/home/HomePage';
import { AboutPage } from '@/pages/about/AboutPage';
import { NotFoundPage } from '@/pages/not-found/NotFoundPage';
import { SignInPage } from '@/pages/sign-in/SignInPage';
import { ConfirmPage } from '@/pages/confirm/ConfirmPage';
import { HouseholdPage } from '@/pages/household/HouseholdPage';
import { AccountsPage } from '@/pages/accounts/AccountsPage';
import { TransactionsPage } from '@/pages/transactions/TransactionsPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="sign-in" element={<SignInPage />} />
        <Route path="auth/confirm" element={<ConfirmPage />} />
        <Route path="household" element={<HouseholdPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
