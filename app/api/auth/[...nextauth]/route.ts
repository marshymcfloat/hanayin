import { authOptions } from "@/features/auth/auth-options";
import NextAuth from "next-auth/next";

// Under `cacheComponents: true`, dynamic-ness is implicit: this handler
// reads cookies on every request, which automatically opts it out of any
// prerender pass. The old route-segment configs (`dynamic`, `fetchCache`,
// `revalidate`) are explicitly forbidden alongside cacheComponents and
// have been removed.
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
