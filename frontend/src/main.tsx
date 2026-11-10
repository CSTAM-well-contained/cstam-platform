import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { queryClient } from "@/api/queries";
import { applyTheme, useTheme } from "@/lib/theme";
import { createRouter } from "@/router";

applyTheme();
const router = createRouter();

function Toasts() {
  const theme = useTheme();
  return <Toaster theme={theme} position="bottom-right" closeButton richColors />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toasts />
    </QueryClientProvider>
  </StrictMode>,
);
