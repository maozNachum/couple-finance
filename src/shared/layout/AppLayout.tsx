import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { HomeMark } from '@/shared/ui/HomeMark';

const daily = [
  ['/dashboard', 'תמונת מצב', '◫'], ['/accounts', 'חשבונות', '▤'],
  ['/transactions', 'תנועות ויתרות', '↔'], ['/budgets', 'תקציבים', '▦'],
] as const;
const secondary = [
  ['/obligations', 'התחייבויות', '↻'], ['/forecast', 'תחזית תזרים', '▥'],
  ['/goals', 'יעדים', '◉'],
  ['/data-quality', 'איכות המידע', 'ⓘ'], ['/categories', 'קטגוריות וסיווג', '◎'],
  ['/imports', 'הכנת CSV', '↑'], ['/reconciliation', 'התאמת תנועות', '⇄'],
  ['/household', 'הבית המשותף', '⌂'], ['/sign-in', 'כניסה', '↗'],
  ['/', 'הבית שלנו', '⌂'], ['/about', 'על המרחב', '◎'],
] as const;

export function AppLayout() {
  const { pathname } = useLocation();
  const previousPath = useRef(pathname);
  const main = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const expanded = menuPath === pathname;
  const secondaryActive = secondary.find(([path]) => path === pathname)?.[1];

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
        <nav className="primary-nav" aria-label="ניווט ראשי" onKeyDown={event => {
          if (event.key === 'Escape' && expanded) { setMenuPath(null); toggle.current?.focus(); }
        }}>
          <div className="daily-nav">{daily.map(([path, label, icon]) => <NavLink key={path} to={path} onClick={() => setMenuPath(null)}><span aria-hidden="true">{icon}</span>{label}</NavLink>)}</div>
          <button className="nav-toggle" ref={toggle} aria-expanded={expanded} aria-controls="secondary-nav" onClick={() => setMenuPath(expanded ? null : pathname)}>
            {expanded ? 'סגירת תפריט' : 'עוד פעולות'}{secondaryActive && <small> · {secondaryActive}</small>}<span aria-hidden="true">{expanded ? '−' : '+'}</span>
          </button>
          <div id="secondary-nav" className={`secondary-nav${expanded ? ' is-open' : ''}`}>
            {secondary.map(([path, label, icon]) => <NavLink key={path} to={path} end={path === '/'} onClick={() => setMenuPath(null)}><span aria-hidden="true">{icon}</span>{label}</NavLink>)}
          </div>
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
