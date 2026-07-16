import { Navigate } from 'react-router-dom';
import { ROUTES } from '../routes';

/**
 * Legacy route shell for `/opposing-counsel`.
 * Canonical UI lives in BenchCounselScreen (`ROUTES.BENCH?tab=counsel`).
 */
const OpposingCounselScreen = () => (
  <Navigate to={{ pathname: ROUTES.BENCH, search: '?tab=counsel' }} replace />
);

export default OpposingCounselScreen;
