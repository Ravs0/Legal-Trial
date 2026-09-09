import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { SelectInput } from '../components/SelectInput';

interface KeyEntry {
  provider: string;
  last4: string;
}

const PROVIDERS = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'courtlistener', label: 'CourtListener' },
  { value: 'indiankanoon', label: 'IndianKanoon' },
];

const KeysScreen: React.FC = () => {
  const [keys, setKeys] = useState<KeyEntry[]>([]);
  const [provider, setProvider] = useState('deepseek');
  const [keyInput, setKeyInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/keys');
      if (!res.ok) throw new Error('Could not load keys. Try again.');
      const data = await res.json();
      setKeys(Array.isArray(data.keys) ? data.keys : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load keys.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput) {
      setError('Enter a key to save.');
      return;
    }
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key: keyInput }),
      });
      if (!res.ok) throw new Error('Save failed. Check the key and try again.');
      const data = await res.json();
      setStatus(`Saved key for ${data.provider}.`);
      setKeyInput('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (name: string) => {
    setRemoving(name);
    setError(null);
    setStatus(null);
    try {
      const url = `/api/keys?provider=${encodeURIComponent(name)}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) throw new Error('Remove failed. Try again.');
      setStatus(`Removed key for ${name}.`);
      setKeys((prev) => prev.filter((k) => k.provider !== name));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed.');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="flex-1 min-h-0 w-full overflow-y-auto bg-brand-bg-primary">
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary">Settings</p>
          <h1 className="text-xl font-medium text-brand-text-primary">API keys</h1>
          <p className="mt-1 text-[13px] text-brand-text-secondary">Bring your own key. Raw keys are never displayed.</p>
        </div>
        {status && <p role="status" className="rounded-md border border-brand-border bg-brand-bg-secondary px-3 py-2 text-[13px] text-brand-text-primary">{status}</p>}
        {error && <p role="alert" className="rounded-md border border-brand-error/40 bg-brand-bg-secondary px-3 py-2 text-[13px] text-brand-text-primary">{error}</p>}
        <Card title="Add a key">
          <form onSubmit={save} className="space-y-3">
            <SelectInput label="Provider" options={PROVIDERS} value={provider} onChange={(e) => { setProvider(e.target.value); setStatus(null); setError(null); }} />
            <div>
              <label htmlFor="byok-key" className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-brand-text-secondary">Key</label>
              <input id="byok-key" type="password" autoComplete="new-password" value={keyInput} onChange={(e) => { setKeyInput(e.target.value); setStatus(null); setError(null); }} placeholder="Paste key" className="block w-full rounded-md border border-brand-border bg-brand-bg-primary px-3 py-2.5 text-sm text-brand-text-primary placeholder:text-brand-text-secondary/40 focus:outline-none" />
            </div>
            <Button type="submit" isLoading={saving} disabled={saving || !keyInput}>Save key</Button>
          </form>
        </Card>
        <Card title="Saved keys">
          {loading ? <p className="text-[13px] text-brand-text-secondary">Loading keys.</p> : keys.length === 0 ? <p className="text-[13px] text-brand-text-secondary">No keys saved yet.</p> : (
            <ul className="space-y-2">
              {keys.map((k) => (
                <li key={k.provider} className="flex items-center justify-between gap-3 rounded-md border border-brand-border px-3 py-2">
                  <span className="text-[13px] text-brand-text-primary">{k.provider} <span className="font-mono text-brand-text-secondary">•••• {k.last4}</span></span>
                  <Button variant="danger" size="sm" onClick={() => void remove(k.provider)} isLoading={removing === k.provider} disabled={removing !== null}>Remove</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
};

export default KeysScreen;
