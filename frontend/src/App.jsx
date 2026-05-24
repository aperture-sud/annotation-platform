import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import AnnotatePage from './pages/AnnotatePage.jsx';
import ScannerPage from './pages/ScannerPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/annotate/:pageId" element={<AnnotatePage />} />
        <Route path="/scan" element={<ScannerPage />} />
      </Routes>
    </BrowserRouter>
  );
}
