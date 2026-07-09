import { Navigate } from 'react-router-dom';
import { ROUTES } from '../constants';

/** @deprecated Use BenchCounselScreen via ROUTES.BENCH?tab=counsel */
const OpposingCounselScreen: React.FC = () => (
  <Navigate to={{ pathname: ROUTES.BENCH, search: '?tab=counsel' }} replace />
);

export default OpposingCounselScreen;
