import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      port: 5174,
    },
    define: {
      __APP_ENV__: JSON.stringify(env.VITE_APP_ENV || mode),
    },
  };
});
