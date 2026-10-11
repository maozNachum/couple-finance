import type { Catalog, Category, Rule } from '@finance/contracts/categorization';

export function DefinitionForms({ catalog, category, rule, disabled, editCategory, editRule, save }: {
  catalog: Catalog; category: Category | null; rule: Rule | null; disabled: boolean;
  editCategory: (v: Category | null) => void; editRule: (v: Rule | null) => void; save: (input: unknown) => void;
}) {
  return <>
    <h2>קטגוריות</h2><p>סוג הקטגוריה נקבע ביצירה. השם אינו משנה משמעות כספית. ארכיון שומר את ההיסטוריה ומונע שיוכים חדשים.</p>
    <ul>{catalog.categories.map((c) => <li key={c.id}>{c.name} · {c.kind === 'EXPENSE' ? 'הוצאה' : 'הכנסה'} · {c.status === 'ARCHIVED' ? 'בארכיון' : 'פעילה'} · גרסה {c.version} {c.status === 'ACTIVE' && <button disabled={disabled} onClick={() => editCategory(c)}>עריכת קטגוריה {c.name}</button>}</li>)}</ul>
    <form className="identity-form" aria-label="עריכת קטגוריה" key={`category-${category?.id ?? 'new'}-${category?.version ?? 0}`} onSubmit={(e) => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      save({ kind: 'CATEGORY', idempotencyKey: crypto.randomUUID(), record: { id: category?.id ?? crypto.randomUUID(), householdId: catalog.householdId, version: (category?.version ?? 0) + 1, name: f.get('name'), kind: category?.kind ?? f.get('kind'), status: f.get('status') } });
    }}><fieldset disabled={disabled}><legend>{category ? 'עריכת קטגוריה' : 'קטגוריה חדשה'}</legend>
      <label>שם קטגוריה<input name="name" required maxLength={100} defaultValue={category?.name ?? ''} /></label>
      <label>סוג קטגוריה<select name="kind" disabled={Boolean(category)} defaultValue={category?.kind ?? 'EXPENSE'}><option value="EXPENSE">הוצאה</option><option value="INCOME">הכנסה</option></select></label>
      <label>מצב קטגוריה<select name="status" defaultValue={category?.status ?? 'ACTIVE'}><option value="ACTIVE">פעילה</option>{category && <option value="ARCHIVED">העברה לארכיון</option>}</select></label>
      <button>שמירת קטגוריה</button>{category && <button type="button" onClick={() => editCategory(null)}>ביטול עריכת קטגוריה</button>}
    </fieldset></form>
    <h2>כללים</h2><p>מספר עדיפות נמוך קודם. באותה עדיפות, קטגוריות שונות נשארות עמומות. יעד זהה מוכרע לפי מזהה כלל קבוע. אותיות אנגליות מומרות לקטנות ורווחים רגילים, טאב ומעברי שורה מצטמצמים; עברית, ניקוד וסימני פיסוק נשמרים.</p>
    <ul>{catalog.rules.map((r) => <li key={r.id}>{r.name} · עדיפות {r.priority} · {r.status === 'ACTIVE' ? 'פעיל' : r.status === 'DISABLED' ? 'מושבת' : 'בארכיון'} · גרסה {r.version} {r.status !== 'ARCHIVED' && <button disabled={disabled} onClick={() => editRule(r)}>עריכת כלל {r.name}</button>}</li>)}</ul>
    <form className="identity-form" aria-label="עריכת כלל" key={`rule-${rule?.id ?? 'new'}-${rule?.version ?? 0}`} onSubmit={(e) => {
      e.preventDefault(); const f = new FormData(e.currentTarget); const target = catalog.categories.find((c) => c.id === f.get('category'));
      save({ kind: 'RULE', idempotencyKey: crypto.randomUUID(), record: { id: rule?.id ?? crypto.randomUUID(), householdId: catalog.householdId, version: (rule?.version ?? 0) + 1, name: f.get('name'), categoryId: target?.id, effect: target?.kind, operator: f.get('operator'), pattern: f.get('pattern'), priority: Number(f.get('priority')), status: f.get('status'), normalization: 1 } });
    }}><fieldset disabled={disabled}><legend>{rule ? 'עריכת כלל' : 'כלל חדש'}</legend>
      <label>שם כלל<input name="name" required maxLength={100} defaultValue={rule?.name ?? ''} /></label>
      <label>קטגוריית יעד<select name="category" required defaultValue={rule?.categoryId ?? ''}><option value="" disabled>בחרו קטגוריה</option>{catalog.categories.filter((c) => c.status === 'ACTIVE' || c.id === rule?.categoryId).map((c) => <option value={c.id} key={c.id}>{c.name}{c.status === 'ARCHIVED' ? ' (בארכיון)' : ''}</option>)}</select></label>
      <label>התאמה לתיאור<select name="operator" defaultValue={rule?.operator ?? 'CONTAINS'}><option value="CONTAINS">מכיל טקסט</option><option value="EQUALS">זהה לטקסט</option></select></label>
      <label>טקסט לחיפוש<input name="pattern" required maxLength={200} defaultValue={rule?.pattern ?? ''} /></label>
      <label>עדיפות<input name="priority" type="number" min={0} max={1000000} step={1} required defaultValue={rule?.priority ?? 100} /></label>
      <label>מצב כלל<select name="status" defaultValue={rule?.status ?? 'ACTIVE'}><option value="ACTIVE">פעיל</option><option value="DISABLED">מושבת</option>{rule && <option value="ARCHIVED">בארכיון</option>}</select></label>
      <button>שמירת כלל</button>{rule && <button type="button" onClick={() => editRule(null)}>ביטול עריכת כלל</button>}
    </fieldset></form>
  </>;
}
