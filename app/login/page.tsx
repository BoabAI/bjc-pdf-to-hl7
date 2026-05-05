import { signIn, AUTH_MODE } from "@/lib/auth";
import { LogoStrip } from "../components/LogoStrip";
import { InstructionalVideo } from "../components/InstructionalVideo";

interface LoginPageProps {
  searchParams: { error?: string; callbackUrl?: string };
}

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "Your account isn't authorised. Sign in with an authorised work account.",
  Configuration: "Authentication is misconfigured. Contact your administrator.",
  Verification: "Sign-in link expired or already used. Try again.",
  PasswordIncorrect: "Incorrect password. Try again.",
};

function errorMessage(code?: string): string | null {
  if (!code) return null;
  return ERROR_MESSAGES[code] ?? "Sign-in failed. Try again.";
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  const error = errorMessage(searchParams.error);
  const callbackUrl = searchParams.callbackUrl ?? "/";

  async function handleEntraSignIn() {
    "use server";
    await signIn("microsoft-entra-id", { redirectTo: callbackUrl });
  }

  const isPasswordMode = AUTH_MODE === "password";
  const isBothMode = AUTH_MODE === "both";
  const showPasswordForm = isPasswordMode || isBothMode;
  const showOAuthForm = !isPasswordMode; // oauth or both

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[640px_420px] gap-6 items-start justify-center">
        <div className="order-2 lg:order-1">
          <InstructionalVideo />
        </div>
        <div className="order-1 lg:order-2 w-full max-w-[420px] mx-auto">
          <LogoStrip />

        <div className="card mt-6 animate-fade-in-up stagger-1">
          <div className="px-7 pt-7 pb-5 text-center">
            <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              PDF to HL7 Converter
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1.5">
              {isBothMode
                ? "Sign in with your Microsoft 365 account or shared access password"
                : isPasswordMode
                  ? "Enter the shared access password"
                  : "Sign in with your work Microsoft 365 account"}
            </p>
          </div>

          <div className="divider-subtle" />

          <div className="px-7 py-6 space-y-5">
            {error && (
              <div className="p-3 rounded-lg bg-[var(--error-bg)] border border-[var(--error-border)] animate-fade-in">
                <div className="flex items-start gap-2">
                  <svg
                    className="w-4 h-4 text-[var(--error)] shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                  <p className="text-sm text-[var(--error)]">{error}</p>
                </div>
              </div>
            )}

            {showOAuthForm && (
              <form action={handleEntraSignIn} className="space-y-5">
                <button type="submit" className="btn-primary w-full">
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 23 23"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                    >
                      <rect x="1" y="1" width="10" height="10" fill="#f25022" />
                      <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
                      <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
                      <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
                    </svg>
                    Sign in with Microsoft
                  </span>
                </button>
              </form>
            )}

            {isBothMode && (
              <div className="flex items-center gap-3" aria-hidden="true">
                <div className="h-px flex-1 bg-[var(--border-light)]" />
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  or
                </span>
                <div className="h-px flex-1 bg-[var(--border-light)]" />
              </div>
            )}

            {showPasswordForm && (
              <form
                action="/api/auth/password"
                method="POST"
                className="space-y-5"
              >
                <label className="block">
                  <span className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                    {isBothMode ? "Shared access password" : "Password"}
                  </span>
                  <input
                    type="password"
                    name="password"
                    required
                    autoFocus={isPasswordMode}
                    autoComplete="current-password"
                    className="w-full px-3 py-2 rounded-md border border-[var(--border-light)] bg-[var(--bg-inner)] focus:outline-none focus:ring-2 focus:ring-[var(--bjc-blue)]"
                  />
                </label>
                <button
                  type="submit"
                  className={isBothMode ? "btn-secondary w-full" : "btn-primary w-full"}
                >
                  Sign in with password
                </button>
              </form>
            )}
          </div>
        </div>
        </div>
      </div>
    </main>
  );
}
