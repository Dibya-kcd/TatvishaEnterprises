import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";
import { componentTagger } from "lovable-tagger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: '/TatvishaEnterprises/',
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify("https://vuzfnlbnjepngerclxqm.supabase.co"),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify("sb_publishable_MDo-be2ubnNahNzjZHfc1g_piDzesJp"),
    'import.meta.env.VITE_SUPABASE_PROJECT_ID': JSON.stringify("vuzfnlbnjepngerclxqm"),
  },
  plugins: [
    react(),
    tailwindcss(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
