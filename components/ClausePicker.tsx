import { useMemo, useState } from 'react';
import { Button } from './Button';
import { SelectInput } from './SelectInput';
import {
  SEED_CLAUSES,
  ValidationError,
  instantiate,
  slotsOf,
} from '../services/clauseLibrary';
import type { Clause } from '../services/clauseLibrary';

interface ClausePickerProps {
  clauses?: Clause[];
}

export function ClausePicker({ clauses = [] }: ClausePickerProps) {
  const all = useMemo(() => [...SEED_CLAUSES, ...clauses], [clauses]);
  const [clauseId, setClauseId] = useState(all[0]?.id ?? '');
  const [values, setValues] = useState<Record<string, string>>({});
  const [rendered, setRendered] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const selected = all.find((c) => c.id === clauseId) ?? all[0];
  const slots = useMemo(() => (selected ? slotsOf(selected) : []), [selected]);

  const pick = (id: string) => {
    setClauseId(id);
    setValues({});
    setRendered(null);
    setErrors([]);
  };

  const run = () => {
    if (!selected) return;
    try {
      setRendered(instantiate(selected, values));
      setErrors([]);
    } catch (e) {
      setRendered(null);
      setErrors(e instanceof ValidationError ? e.errors : [String(e)]);
    }
  };

  if (!selected) return <p className="text-brand-text-secondary text-sm">No clauses available.</p>;

  return (
    <div className="rounded-md bg-brand-bg-secondary border border-brand-border p-4">
      <h3 className="font-serif text-brand-text-primary text-[15px]">Clause picker</h3>
      <p className="text-brand-text-secondary text-[12px] mt-1">
        {selected.jurisdiction} v{selected.version}
      </p>
      <SelectInput
        label="Clause"
        value={clauseId}
        onChange={(e) => pick(e.target.value)}
        options={all.map((c) => ({ value: c.id, label: c.title }))}
      />
      <p className="font-serif text-brand-text-primary text-[13px] leading-relaxed">{selected.body}</p>
      <div className="mt-3 grid gap-3">
        {slots.map((s) => (
          <label key={s.name} className="block">
            <span className="block text-brand-text-secondary text-[11px] uppercase tracking-[0.12em] mb-1">
              {s.name} ({s.type})
            </span>
            <input
              value={values[s.name] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [s.name]: e.target.value }))}
              placeholder={s.type}
              className="block w-full bg-brand-bg-primary rounded-md py-2 px-3 border border-brand-border text-brand-text-primary text-sm focus:outline-none focus:border-white/35"
            />
          </label>
        ))}
      </div>
      <div className="mt-4">
        <Button onClick={run}>Instantiate</Button>
      </div>
      {rendered && (
        <p className="mt-3 font-serif text-brand-text-primary text-[13px] leading-relaxed border-t border-brand-border pt-3">
          {rendered}
        </p>
      )}
      {errors.length > 0 && (
        <ul className="mt-3 border-t border-brand-border pt-3 space-y-1">
          {errors.map((e) => (
            <li key={e} className="text-brand-error text-[12px]">
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
