import { Navigate } from 'react-router-dom';
import { ROUTES } from '../routes';

/**
 * Legacy route shell for `/judges`.
 * Canonical UI lives in BenchCounselScreen (`ROUTES.BENCH`, judges tab).
 */
const JudgesScreen = () => <Navigate to={ROUTES.BENCH} replace />;

export default JudgesScreen;
