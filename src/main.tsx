import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// No StrictMode: the 3D world is built imperatively once per mount (lights register
// with the power grid), and double-mounting in dev would register them twice.
createRoot(document.getElementById('root')!).render(<App />);
