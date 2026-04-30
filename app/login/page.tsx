import { signIn } from "@/lib/auth";
import { LogoStrip } from "../components/LogoStrip";

interface LoginPageProps {
  searchParams: { error?: string; callbackUrl?: string };
}

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "Your account isn't authorised. Sign in with an authorised work account.",
  Configuration: "Authentication is misconfigured. Contact your administrator.",
  Verification: "Sign-in link expired or already used. Try again.",
};

function errorMessage(code?: string): string | null {
  if (!code) return null;
  return ERROR_MESSAGES[code] ?? "Sign-in failed. Try again.";
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  const error = errorMessage(searchParams.error);
  const callbackUrl = searchParams.callbackUrl ?? "/";

  async function handleSignIn() {
    "use server";
    await signIn("microsoft-entra-id", { redirectTo: callbackUrl });
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-[420px]">
        <LogoStrip />

        <div className="card mt-6 animate-fade-in-up stagger-1">
          <div className="px-7 pt-7 pb-5 text-center">
            <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              PDF to HL7 Converter
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1.5">
              Sign in with your work Microsoft 365 account
            </p>
          </div>

          <div className="divider-subtle" />

          <div className="px-7 py-6">
            <form action={handleSignIn} className="space-y-5">
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
          </div>
        </div>

      </div>
    </main>
  );
}
