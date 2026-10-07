import { Link } from 'react-router-dom';
import { HomeMark } from '@/shared/ui/HomeMark';

export function HomePage() {
  return (
    <div className="page home-page">
      <div className="page-heading"><p className="eyebrow">הבית שלנו</p><h1>טוב להיות באותו עמוד.</h1><p>מעוז ושחר, זה המקום שממנו מתחילים.</p></div>
      <section className="welcome-card" aria-labelledby="welcome-title">
        <div className="welcome-copy"><span className="light-label">התחלה משותפת</span><h2 id="welcome-title">מקום אחד.<br />תמונה משותפת.</h2><p>בונים בית לכל מה שחשוב לדעת על הכסף שלנו, כדי לתכנן את ההמשך יחד.</p><Link className="light-link" to="/about">להכיר את המרחב <span aria-hidden="true">←</span></Link></div>
        <div className="house-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="art-disc"><HomeMark /></div><span className="art-spark spark-one">+</span><span className="art-spark spark-two">+</span><span className="art-dot" /></div>
      </section>
      <section className="status-panel" aria-labelledby="status-title"><div className="status-icon" aria-hidden="true">↗</div><div><p className="eyebrow">הצעד הראשון</p><h2 id="status-title">הבסיס מוכן. מכאן בונים יחד.</h2><p>המערכת עדיין בהקמה. בשלב הזה אין חשבונות מחוברים או נתונים פיננסיים להצגה.</p></div><span className="outline-label">תחילת הדרך</span></section>
      <div className="principles" aria-label="העקרונות שלנו"><div><span className="principle-number">01</span><h2>ביחד</h2><p>מרחב משותף לניהול הבית.</p></div><div><span className="principle-number">02</span><h2>בבהירות</h2><p>תמונה מובנת, בלי לנחש.</p></div><div><span className="principle-number">03</span><h2>בקצב שלנו</h2><p>צעד קטן בדרך לתכנון משותף.</p></div></div>
    </div>
  );
}
