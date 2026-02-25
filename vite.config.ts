import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      'process.env.DEEPSEEK_NVIDIA_API_KEY': JSON.stringify(env.DEEPSEEK_NVIDIA_API_KEY || process.env.DEEPSEEK_NVIDIA_API_KEY || ''),
      'process.env.DEEPSEEK_API_KEY': JSON.stringify(env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_CHAT_API_KEY || process.env.DEEPSEEK_API_KEY || ''),
      'process.env.KIMI_API_KEY': JSON.stringify(env.KIMI_API_KEY || process.env.KIMI_API_KEY || ''),
      'process.env.MINIMAX_API_KEY': JSON.stringify(env.MINIMAX_API_KEY || process.env.MINIMAX_API_KEY || ''),
      'process.env.GROQ_API_KEY': JSON.stringify(env.GROQ_API_KEY || process.env.GROQ_API_KEY || ''),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
