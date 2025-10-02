import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage  from './pages/Homepage.tsx'
import SponsorsPage from './pages/SponsorsPage.tsx'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/sponsorspage" element={<SponsorsPage />} />
        <Route path="/sponsorspage" element={<SponsorsPage />} />
        <Route path="/sponsorspage" element={<SponsorsPage />} />
        <Route path="/sponsorspage" element={<SponsorsPage />} />

      </Routes>
    </BrowserRouter>
  )
}

export default App