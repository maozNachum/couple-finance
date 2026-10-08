import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { HomeMark } from '@/shared/ui/HomeMark';

export function AppLayout() {
  const { pathname } = useLocation();
  const previousPath = useRef(pathname);
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    if (previousPath.current !== pathname) {
      main.current?.focus();
      previousPath.current = pathname;
    }
  }, [pathname]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">דילוג לתוכן הראשי</a>
      <aside className="sidebar">
        <NavLink className="brand" to="/" aria-label="Couple Finance — דף הבית">
          <span className="brand-mark"><HomeMark /></span>
          <span><b dir="ltr">Couple Finance</b><small>הבית הפיננסי שלנו</small></span>
        </NavLink>
        <nav className="primary-nav" aria-label="ניווט ראשי">
          <NavLink to="/" end><span aria-hidden="true">⌂</span>הבית שלנו</NavLink>
          <NavLink to="/about"><span aria-hidden="true">◎</span>על המרחב</NavLink>
          <NavLink to="/household"><span aria-hidden="true">⌂</span>הבית המשותף</NavLink>
          <NavLink to="/sign-in"><span aria-hidden="true">↗</span>כניסה</NavLink>
        </nav>
        <div className="household-note">
          <span className="initials" aria-hidden="true">מ ש</span>
          <span><strong>מעוז ושחר</strong><small>מקום אחד, לשנינו</small></span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar"><span>המרחב המשותף</span><span className="stage-badge"><i aria-hidden="true" />בשלב הקמה</span></header>
        <main id="main-content" ref={main} tabIndex={-1}><Outlet /></main>
        <footer className="footer"><span dir="ltr">Couple Finance</span><span>מתקדמים יחד, צעד אחר צעד.</span></footer>
      </div>
    </div>
  );
}
