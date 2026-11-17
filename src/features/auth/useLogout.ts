import { useNavigate } from 'react-router';
import { clearSession } from '../../graphql/session';
import { staffLogout } from './authApi';

/** Logs out locally at once; the server call runs in the background and its failure is ignored. */
export function useLogout(): () => void {
  const navigate = useNavigate();

  return () => {
    clearSession();
    staffLogout().catch(() => undefined);
    void navigate('/login', { replace: true });
  };
}
