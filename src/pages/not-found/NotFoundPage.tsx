import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return <div className="page"><div className="page-heading"><p className="eyebrow">404</p><h1>העמוד הזה לא נמצא.</h1><p>אפשר לחזור למרחב המשותף ולהמשיך משם.</p><Link className="text-link" to="/">חזרה לבית שלנו</Link></div></div>;
}
