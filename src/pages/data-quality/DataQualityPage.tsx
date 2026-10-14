import { DataQualityPanel } from '@/features/data-quality/components/DataQualityPanel';
export function DataQualityPage() {
  return <div className="page accounts-page"><header className="page-header"><p className="eyebrow">ראיות ומידע חסר</p><h1>איכות המידע הפיננסי</h1><p>מה ידוע, מה דורש בירור ואיפה אפשר לבדוק — לפי הנתונים המורשים בבית.</p></header><DataQualityPanel /></div>;
}
