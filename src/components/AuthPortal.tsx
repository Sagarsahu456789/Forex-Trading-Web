import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { AuthUser, UserRole } from '../types/academy';

interface AuthPortalProps {
  initialMode: 'LOGIN' | 'REGISTER';
  initialRole: UserRole;
  onSuccess: (token: string, user: AuthUser) => void;
  onBack: () => void;
}

export function AuthPortal({ initialMode, initialRole, onSuccess, onBack }: AuthPortalProps) {
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER' | 'FORGOT' | 'RESET'>(initialMode);
  const [role, setRole] = useState<UserRole>(initialRole);
  const [needsAdminSetup, setNeedsAdminSetup] = useState(false);
  const [checkingBootstrap, setCheckingBootstrap] = useState(true);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [adminSetupForm, setAdminSetupForm] = useState({
    fullName: 'Academy Administrator',
    email: 'admin@aureliafx.edu',
    password: '',
  });

  const [regForm, setRegForm] = useState({
    fullName: '',
    email: '',
    mobile: '',
    address: '',
    dob: '',
    referredByCode: '',
    password: '',
  });

  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiRequest<{ needsAdminSetup: boolean }>('/api/auth/bootstrap-status')
      .then((res) => setNeedsAdminSetup(res.needsAdminSetup))
      .catch(() => {})
      .finally(() => setCheckingBootstrap(false));
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: { identifier, password, role },
      });
      onSuccess(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSetup = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/setup-admin', {
        method: 'POST',
        body: adminSetupForm,
      });
      setNeedsAdminSetup(false);
      onSuccess(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize administrator account.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/register', {
        method: 'POST',
        body: regForm,
      });
      onSuccess(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    setLoading(true);
    try {
      const res = await apiRequest<{ message: string; devPreviewResetToken?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: { email: forgotEmail },
      });
      if (res.devPreviewResetToken) {
        setResetToken(res.devPreviewResetToken);
      }
      setInfoMessage(res.message);
      setMode('RESET');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to initiate password reset.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        body: { token: resetToken, newPassword: resetNewPassword },
      });
      setInfoMessage('Password updated. Sign in with your new password.');
      setMode('LOGIN');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#08101E] text-slate-100 flex flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-md">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Academy Website
        </button>

        <div className="rounded-xl border border-slate-800 bg-[#0D172A] p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-[#D4A843] font-medium">Aurelia FX Academy</p>
              <h1 className="mt-1 font-display text-2xl font-bold text-white">
                {mode === 'REGISTER'
                  ? 'Student Registration'
                  : mode === 'FORGOT'
                    ? 'Forgot Password'
                    : mode === 'RESET'
                      ? 'Reset Password'
                      : role === 'ADMIN' && needsAdminSetup
                        ? 'First-Run Admin Setup'
                        : `${role.charAt(0) + role.slice(1).toLowerCase()} Portal Sign In`}
              </h1>
            </div>
            <KeyRound className="h-6 w-6 text-[#D4A843]" />
          </div>

          {mode === 'LOGIN' && (
            <div className="mt-6 grid grid-cols-3 gap-1 rounded-lg bg-[#08101E] p-1 border border-slate-800">
              {(['STUDENT', 'MENTOR', 'ADMIN'] as UserRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setRole(r);
                    setError('');
                  }}
                  className={`rounded-md py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    role === r ? 'bg-[#D4A843] text-[#08101E]' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {r.charAt(0) + r.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          )}

          {infoMessage && (
            <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-950/40 p-3 text-xs text-emerald-200">
              {infoMessage}
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-200">{error}</div>
          )}

          {/* First-Run Admin Setup Claim Form */}
          {mode === 'LOGIN' && role === 'ADMIN' && !checkingBootstrap && needsAdminSetup ? (
            <form onSubmit={handleAdminSetup} className="mt-6 space-y-4">
              <div className="rounded-lg border border-[#D4A843]/30 bg-[#08101E] p-3.5 text-xs text-slate-300 flex items-start gap-2.5">
                <ShieldCheck className="h-4 w-4 text-[#D4A843] shrink-0 mt-0.5" />
                <span>
                  No Administrator password has been claimed yet. Set your primary Admin credentials below to initialize
                  the academy console.
                </span>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Administrator Name</label>
                <input
                  required
                  value={adminSetupForm.fullName}
                  onChange={(e) => setAdminSetupForm({ ...adminSetupForm, fullName: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2.5 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Admin Email</label>
                <input
                  required
                  type="email"
                  value={adminSetupForm.email}
                  onChange={(e) => setAdminSetupForm({ ...adminSetupForm, email: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2.5 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Choose Admin Password (min 8 chars)</label>
                <input
                  required
                  minLength={8}
                  type="password"
                  value={adminSetupForm.password}
                  onChange={(e) => setAdminSetupForm({ ...adminSetupForm, password: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2.5 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                  placeholder="Create a strong password"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#D4A843] py-2.5 text-sm font-semibold text-[#08101E] hover:bg-[#E5BE5C] cursor-pointer"
              >
                {loading ? 'Initializing Admin...' : 'Claim Admin Account & Enter Console'}
              </button>
            </form>
          ) : mode === 'LOGIN' ? (
            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {role === 'STUDENT' ? 'Email, Username, or Student ID (e.g. FXA-2026-0001)' : 'Email or Username'}
                </label>
                <input
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2.5 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                  placeholder={role === 'STUDENT' ? 'FXA-2026-0001 or email' : 'user@aureliafx.edu'}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
                <div className="relative">
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2.5 pr-10 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-white cursor-pointer"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <button type="button" onClick={() => setMode('FORGOT')} className="text-slate-400 hover:text-[#E5BE5C] cursor-pointer">
                  Forgot password?
                </button>
                <button type="button" onClick={() => setMode('REGISTER')} className="text-[#E5BE5C] hover:underline cursor-pointer">
                  New Student? Register
                </button>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#D4A843] py-2.5 text-sm font-semibold text-[#08101E] hover:bg-[#E5BE5C] disabled:opacity-60 cursor-pointer"
              >
                {loading ? 'Signing In...' : 'Sign In'}
              </button>
            </form>
          ) : mode === 'REGISTER' ? (
            <form onSubmit={handleRegister} className="mt-6 space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Full Name *</label>
                <input
                  required
                  value={regForm.fullName}
                  onChange={(e) => setRegForm({ ...regForm, fullName: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email *</label>
                <input
                  required
                  type="email"
                  value={regForm.email}
                  onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Mobile *</label>
                  <input
                    required
                    value={regForm.mobile}
                    onChange={(e) => setRegForm({ ...regForm, mobile: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Referral Code</label>
                  <input
                    value={regForm.referredByCode}
                    onChange={(e) => setRegForm({ ...regForm, referredByCode: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Password (min 8 chars) *</label>
                <input
                  required
                  minLength={8}
                  type="password"
                  value={regForm.password}
                  onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#D4A843] py-2.5 text-sm font-semibold text-[#08101E] hover:bg-[#E5BE5C] cursor-pointer"
              >
                {loading ? 'Creating Account...' : 'Create Student Account'}
              </button>
              <button
                type="button"
                onClick={() => setMode('LOGIN')}
                className="w-full text-center text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Already registered? Sign In
              </button>
            </form>
          ) : mode === 'FORGOT' ? (
            <form onSubmit={handleForgot} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Account Email</label>
                <input
                  required
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2.5 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#D4A843] py-2.5 text-sm font-semibold text-[#08101E] hover:bg-[#E5BE5C] cursor-pointer"
              >
                Send Reset Verification Token
              </button>
              <button type="button" onClick={() => setMode('LOGIN')} className="w-full text-xs text-slate-400 hover:text-white cursor-pointer">
                Return to Sign In
              </button>
            </form>
          ) : (
            <form onSubmit={handleReset} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Verification Token</label>
                <input
                  required
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2.5 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">New Password (min 8 chars)</label>
                <input
                  required
                  minLength={8}
                  type="password"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-[#08101E] px-3.5 py-2.5 text-sm text-white focus:border-[#D4A843] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#D4A843] py-2.5 text-sm font-semibold text-[#08101E] hover:bg-[#E5BE5C] cursor-pointer"
              >
                Update Password
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
