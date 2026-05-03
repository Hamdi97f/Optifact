import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { isApiConfigured } from '@/lib/apiClient';

const TEST_USER_EMAIL = import.meta.env.VITE_TEST_USER_EMAIL ?? 'test@optifact.local';
const TEST_USER_PASSWORD = import.meta.env.VITE_TEST_USER_PASSWORD ?? 'password123';

export default function Login() {
  const { session, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } =
      mode === 'signin'
        ? await signIn(email, password)
        : await signUp(email, password, companyName || 'My Company');
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    if (mode === 'signin') navigate('/');
    else setError('Check your email to confirm your account, then sign in.');
  }

  async function handleUseTestAccount() {
    setError(null);
    setMode('signin');
    setEmail(TEST_USER_EMAIL);
    setPassword(TEST_USER_PASSWORD);
    setSubmitting(true);

    // Try to sign in first.
    let { error: signInError } = await signIn(TEST_USER_EMAIL, TEST_USER_PASSWORD);

    // If the test account doesn't exist yet, create it on the fly and retry.
    if (signInError && /invalid login credentials/i.test(signInError)) {
      const { error: signUpError } = await signUp(
        TEST_USER_EMAIL,
        TEST_USER_PASSWORD,
        'Test Company',
      );
      if (signUpError) {
        setSubmitting(false);
        setError(signUpError);
        return;
      }
      // Our signUp() also attempts to sign the user in. If it didn't,
      // try again explicitly so the navigation below can proceed.
      ({ error: signInError } = await signIn(TEST_USER_EMAIL, TEST_USER_PASSWORD));
      if (signInError) {
        setSubmitting(false);
        setError(
          'Test account was created but could not be signed in automatically. ' +
            'If your gateway requires email confirmation, confirm the user, ' +
            'then click "Use test account" again.',
        );
        return;
      }
    } else if (signInError) {
      setSubmitting(false);
      setError(signInError);
      return;
    }

    setSubmitting(false);
    navigate('/');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-5 w-5" />
          </div>
          <CardTitle>Welcome to Optifact</CardTitle>
          <CardDescription>
            {mode === 'signin' ? 'Sign in to your workspace.' : 'Create your company workspace.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isApiConfigured && (
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              The API gateway is not configured. Copy <code>.env.example</code> to <code>.env</code> and set
              <code> VITE_API_GATEWAY_URL</code> and <code>VITE_API_GATEWAY_KEY</code>.
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <Label htmlFor="company">Company name</Label>
                <Input
                  id="company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme SARL"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={submitting}
              onClick={handleUseTestAccount}
            >
              Use test account
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            {mode === 'signin' ? (
              <>
                No account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className="font-medium text-primary hover:underline"
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('signin')}
                  className="font-medium text-primary hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
