import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/application-gestion-de-compte-/",
  plugins: [react()],
});
