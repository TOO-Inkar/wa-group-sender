import { defineConfig, devices } from '@playwright/test'

// E2E против бэкенда в профиле fake (без WhatsApp): BASE_URL, логин admin / E2E_PASSWORD.
// Никогда не запускать против прода — тест создаёт заявки, и они ушли бы в настоящие группы.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:18080', locale: 'ru-RU', timezoneId: 'Asia/Almaty', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, grep: /@phone/ },
  ],
})
