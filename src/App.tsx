import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage  from './pages/Homepage.tsx'
import SponsorsPage from './pages/SponsorPage.tsx'
import About from './pages/about.tsx'
import Contact from './pages/contact.tsx'
import Garage from './pages/garage.tsx'
import Join from './pages/join.tsx'
import Members from './pages/members.tsx'
import Newsletter from './pages/newsletter.tsx'
import SponsorPortal from './pages/Sponsorportal.tsx'
import { Navbar } from './libs/components/navbar/Navbar.tsx'

function App() {
  return (
    <BrowserRouter>
    <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/sponsorpage" element={<SponsorsPage />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/garage" element={<Garage />} />
        <Route path="/join" element={<Join />} />
        <Route path="/members" element={<Members />} />
        <Route path="/newsletter" element={<Newsletter />} />
        <Route path="/sponsorportal" element={<SponsorPortal />} />
      </Routes>
    </BrowserRouter>
    
  )
}

export default App