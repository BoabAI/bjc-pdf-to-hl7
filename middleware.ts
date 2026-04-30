import { NextResponse, NextRequest } from "next/server";
import { auth } from "@/lib/auth";

const PUBLIC_PATH_PREFIXES = ["/api/auth", "/login"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export type RouteAction =
  | { kind: "next"; cacheControl: string }
  | { kind: "redirect"; to: string; cacheControl: string };

/**
 * Pure routing decision used by the middleware. Extracted so it can be
 * unit-tested without instantiating Auth.js or NextResponse.
 */
export function decideRoute(
  pathname: string,
  isAuthenticated: boolean
): RouteAction {
  if (isPublicPath(pathname)) {
    if (isAuthenticated && pathname === "/login") {
      return {
        kind: "redirect",
        to: "/",
        cacheControl: "no-store, must-revalidate",
      };
    }
    return { kind: "next", cacheControl: "" };
  }
  if (!isAuthenticated) {
    return {
      kind: "redirect",
      to: "/login",
      cacheControl: "no-store, must-revalidate",
    };
  }
  return {
    kind: "next",
    cacheControl: "private, no-cache, no-store, must-revalidate",
  };
}

function applyDecision(
  request: NextRequest,
  decision: RouteAction
): NextResponse {
  if (decision.kind === "redirect") {
    const response = NextResponse.redirect(new URL(decision.to, request.url));
    if (decision.cacheControl) {
      response.headers.set("Cache-Control", decision.cacheControl);
    }
    return response;
  }
  const response = NextResponse.next();
  if (decision.cacheControl) {
    response.headers.set("Cache-Control", decision.cacheControl);
  }
  return response;
}

export default auth((request) => {
  const isAuthenticated = Boolean(request.auth);
  const decision = decideRoute(request.nextUrl.pathname, isAuthenticated);
  return applyDecision(request, decision);
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)",
  ],
};
