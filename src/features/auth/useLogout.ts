import { useNavigate } from 'react-router';
import { clearSession } from '../../graphql/session';
import { staffLogout } from './authApi';

export interface LogoutOptions {
  /** Shown on the login page, e.g. why the session ended. Never a server message. */
  notice?: string;
}

/** Logs out locally at once; the server call runs in the background and its failure is ignored. */
export function useLogout(): (options?: LogoutOptions) => void {
  const navigate = useNavigate();

  return (options) => {
    clearSession();
    staffLogout().catch(() => undefined);
    void navigate('/login', {
      replace: true,
      state: options?.notice ? { notice: options.notice } : null,
    });
  };
}
