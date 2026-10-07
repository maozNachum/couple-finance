import { Link } from 'react-router-dom';

export function AboutPage() {
  return (
    <div className="page about-page"><div className="page-heading"><p className="eyebrow">על המרחב</p><h1>הבית הפיננסי שלנו.</h1><p>מקום משותף למעוז ושחר.</p></div><section className="information-card" aria-labelledby="about-title"><h2 id="about-title">מתחילים מהבסיס</h2><p>Couple Finance נבנית כדי לעזור לנו להבין את המצב הפיננסי של הבית ולתכנן יחד.</p><p>כרגע זוהי מעטפת ראשונית בלבד. ניהול חשבונות, תנועות, תקציבים ותחזיות יתווספו בהמשך. לא הוזנו נתונים ולא חוברו שירותים פיננסיים.</p><p>המערכת מיועדת להצגת מידע ולתכנון. היא לא תבצע תשלומים, העברות או פעולות השקעה.</p><Link className="text-link" to="/">חזרה לבית שלנו <span aria-hidden="true">←</span></Link></section></div>
  );
}
