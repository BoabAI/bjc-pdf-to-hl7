import { NextResponse, type NextRequest } from "next/server";
import {
  PASSWORD_COOKIE_NAME,
  isValidAppPassword,
  passwordCookieMaxAgeSeconds,
  signPasswordCookie,
} from "@/lib/auth-mode";
import { getAuthMode } from "@/lib/auth-mode";

export const runtime = "nodejs";

/**
 * Resolve the public origin for redirects. Behind Amplify/CloudFront the
 * Lambda sees an internal request URL (often `http://localhost:3000`), so
 * we can't use `request.url` — that would 303 the browser to localhost.
 *
 * Trust `x-forwarded-host` + `x-forwarded-proto` (Amplify / CloudFront /
 * any standard reverse proxy sets these). Fall back to `host` and finally
 * `request.nextUrl.origin` for local dev where no proxy is in front.
 */
function publicOrigin(request: NextRequest): string {
  const proto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(/:$/, "") ??
    "https";
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.host;
  return `${proto}://${host}`;
}

/**
 * Issue a password-mode session cookie when the submitted password matches
 * APP_PASSWORD. Only enabled when AUTH_MODE=password — returns 404 in any
 * other mode so probing the endpoint doesn't reveal it.
 */
export async function POST(request: NextRequest) {
  if (getAuthMode() !== "password") {
    return new NextResponse("Not found", { status: 404 });
  }

  let password: string | undefined;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { password?: unknown };
      password = typeof body.password === "string" ? body.password : undefined;
    } else {
      const form = await request.formData();
      const value = form.get("password");
      password = typeof value === "string" ? value : undefined;
    }
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  if (!isValidAppPassword(password)) {
    // For browser form posts, send back to /login with a friendly error.
    if (!contentType.includes("application/json")) {
      const url = new URL("/login", publicOrigin(request));
      url.searchParams.set("error", "PasswordIncorrect");
      const redirect = NextResponse.redirect(url, { status: 303 });
      redirect.headers.set("Cache-Control", "no-store, must-revalidate");
      return redirect;
    }
    return NextResponse.json(
      { success: false, error: "Incorrect password" },
      { status: 401 }
    );
  }

  const maxAge = passwordCookieMaxAgeSeconds();
  const expiresEpoch = Math.floor(Date.now() / 1000) + maxAge;
  const cookieValue = await signPasswordCookie(expiresEpoch);

  // Only redirect for form posts (browser nav). JSON callers expect JSON.
  const wantsHtml = !contentType.includes("application/json");
  const response = wantsHtml
    ? NextResponse.redirect(new URL("/", publicOrigin(request)), { status: 303 })
    : NextResponse.json({ success: true });

  response.cookies.set({
    name: PASSWORD_COOKIE_NAME,
    value: cookieValue,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  response.headers.set("Cache-Control", "no-store, must-revalidate");
  return response;
}

/** Clear the password cookie. Always returns 200 to keep logout idempotent. */
export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: PASSWORD_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store, must-revalidate");
  // Touch to silence "unused" if request is unused at runtime.
  void request;
  return response;
}
