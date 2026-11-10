import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { auth } from "@/lib/auth";
import { routes } from "@/router";

// renderApp mounts the whole app at `path`, signed in with `token` (or signed out).
export function renderApp(path: string, token?: string) {
  if (token) auth.signIn(token);
  else auth.signOut();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return {
    router,
    ...render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>,
    ),
  };
}
