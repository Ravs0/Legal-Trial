import { Navigate } from 'react-router-dom';
import { ROUTES } from '../constants';

/** @deprecated Use BenchCounselScreen via ROUTES.BENCH */
const JudgesScreen: React.FC = () => <Navigate to={ROUTES.BENCH} replace />;

export default JudgesScreen;
