import { defineConfig, devices } from '@playwright/test'

// Только против профиля fake: тест создаёт заявки, на проде они уйдут в настоящие группы.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:18080', locale: 'ru-RU', timezoneId: 'Asia/Almaty', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, grep: /@phone/ },
  ],
})
