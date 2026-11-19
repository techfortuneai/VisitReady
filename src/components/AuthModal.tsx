/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { api } from '../services/api.ts';
import { X, ShieldAlert, ArrowRight } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
  initialMode?: 'login' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialMode = 'login',
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ackSafety, setAckSafety] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setName('');
      setEmail('');
      setPassword('');
      setAckSafety(false);
      setError('');
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      if (mode === 'login') {
        await api.login({ email, password });
      } else {
        if (!ackSafety) {
          setError('Please acknowledge the personal recordkeeping notice to continue.');
          setIsLoading(false);
          return;
        }
        await api.register({ email, password, name, acknowledged_safety: ackSafety });
      }
      await onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setIsLoading(true);
    try {
      await api.loginWithGooglePopup();
      await onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Google sign-in could not be completed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError('');
    setIsLoading(true);
    try {
      await api.loginDemo();
      await onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not start demo session.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl border border-emerald-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-emerald-100 bg-emerald-50/40">
          <div>
            <h2 className="text-base font-bold text-zinc-900">
              {mode === 'login' ? 'Sign In to VisitReady' : 'Create Your VisitReady Account'}
            </h2>
            <p className="text-xs text-zinc-500">
              Private personal & family health recordkeeping.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 font-medium">
              {error}
            </div>
          )}

          {/* Primary Google Sign-In (Cloud Firestore Persistence) */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer shadow-xs disabled:opacity-50"
          >
            <span>Continue with Google (Cloud Sync Database)</span>
            <ArrowRight className="w-4 h-4 text-emerald-100" />
          </button>

          {/* Quick Demo Account */}
          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer disabled:opacity-50"
          >
            <span>Open Demo Account (Priya Sharma, 42)</span>
            <ArrowRight className="w-4 h-4 text-emerald-700" />
          </button>

          <div className="flex items-center gap-3 text-2xs text-zinc-400 uppercase tracking-wider">
            <span className="flex-1 h-px bg-zinc-200" />
            <span>Or continue with email</span>
            <span className="flex-1 h-px bg-zinc-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Aarav Sharma"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-emerald-700"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Email Address *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.in"
                className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-emerald-700"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Password *</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-emerald-700"
              />
            </div>

            {mode === 'register' && (
              <label className="flex items-start gap-2 p-3 bg-emerald-50/40 border border-emerald-200/80 rounded-lg text-xs text-zinc-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ackSafety}
                  onChange={(e) => setAckSafety(e.target.checked)}
                  className="mt-0.5 rounded accent-emerald-700 shrink-0"
                />
                <span>
                  I understand VisitReady is a personal health journal and does not provide medical diagnoses or emergency help. For emergencies in India, I will call <strong>112 / 108</strong>.
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              {isLoading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="text-center text-xs text-zinc-500 pt-1">
            {mode === 'login' ? (
              <>
                New to VisitReady?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError('');
                  }}
                  className="text-emerald-700 font-semibold hover:underline cursor-pointer"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                  }}
                  className="text-emerald-700 font-semibold hover:underline cursor-pointer"
                >
                  Sign In
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 text-2xs text-zinc-400 justify-center pt-1">
            <ShieldAlert className="w-3.5 h-3.5 text-emerald-600" />
            <span>Your health records remain private on your account.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
