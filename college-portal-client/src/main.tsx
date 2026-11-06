import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { printRecruitingCat } from './components/ambient/consoleCat'

document.documentElement.classList.add('dark')

// Пасхалка для тех, кто открыл F12: рекрутинг-кот.
printRecruitingCat()

// Регистрируем service worker: без него браузер не предложит установку PWA.
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)