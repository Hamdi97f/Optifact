import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
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
  const { t } = useI18n();
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
    else setError(t('login.confirm_email'));
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
        setError(t('login.test_create_failed'));
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
          <CardTitle>{t('login.welcome')}</CardTitle>
          <CardDescription>
            {mode === 'signin' ? t('login.signin_desc') : t('login.signup_desc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isApiConfigured && (
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              {t('login.api_warning')}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <Label htmlFor="company">{t('login.company_name')}</Label>
                <Input
                  id="company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={t('login.company_placeholder')}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">{t('common.email')}</Label>
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
              <Label htmlFor="password">{t('login.password')}</Label>
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
              {submitting
                ? t('common.please_wait')
                : mode === 'signin'
                  ? t('login.signin')
                  : t('login.create_account')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={submitting}
              onClick={handleUseTestAccount}
            >
              {t('login.use_test')}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            {mode === 'signin' ? (
              <>
                {t('login.no_account')}{' '}
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className="font-medium text-primary hover:underline"
                >
                  {t('login.create_one')}
                </button>
              </>
            ) : (
              <>
                {t('login.have_account')}{' '}
                <button
                  type="button"
                  onClick={() => setMode('signin')}
                  className="font-medium text-primary hover:underline"
                >
                  {t('login.signin')}
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
