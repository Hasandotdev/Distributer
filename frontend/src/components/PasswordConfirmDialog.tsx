import { useState } from 'react';
import Modal from './Modal';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface PasswordConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}

export default function PasswordConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
}: PasswordConfirmDialogProps) {
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    if (!password.trim()) {
      setError('Password is required');
      return;
    }
    if (!user?.email) {
      setError('No user session found');
      return;
    }

    setLoading(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });

    if (authError) {
      setError('Incorrect password');
      setLoading(false);
      return;
    }

    setPassword('');
    setError('');
    setLoading(false);
    onConfirm();
    onClose();
  }

  function handleClose() {
    setPassword('');
    setError('');
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title={title} size="sm">
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">{message}</p>
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
          Enter your password to confirm
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
          placeholder="Password"
          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
          autoFocus
        />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
      <div className="flex justify-end gap-3">
        <button
          onClick={handleClose}
          className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition"
        >
          {loading ? 'Verifying...' : 'Confirm Delete'}
        </button>
      </div>
    </Modal>
  );
}
