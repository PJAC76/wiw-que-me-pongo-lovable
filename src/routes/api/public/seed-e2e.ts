import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// One-off endpoint to provision a confirmed E2E test user.
// Protected by a shared token. DELETE this file after use.
const SEED_TOKEN = "wiw-e2e-seed-2026-06-24";

export const Route = createFileRoute("/api/public/seed-e2e")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-seed-token");
        if (token !== SEED_TOKEN) {
          return new Response("forbidden", { status: 403 });
        }
        const url = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !serviceKey) {
          return new Response(
            JSON.stringify({
              error: "missing_env",
              has_url: Boolean(url),
              has_service_key: Boolean(serviceKey),
            }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
        const admin = createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const suffix = Math.random().toString(36).slice(2, 10);
        const email = `e2e+${suffix}@wiw-e2e.lovable.app`;
        const password = `E2e-${Math.random().toString(36).slice(2, 14)}-Aa1!`;
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: "E2E Test User", purpose: "playwright" },
        });
        if (error) {
          return new Response(
            JSON.stringify({ error: error.message, status: error.status }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ email, password, user_id: data.user?.id }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
