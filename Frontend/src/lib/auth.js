// Access token lives only in memory (lost on reload, never in localStorage).
// Refresh token persists in localStorage so the session survives a page reload.
const KEY = 'rt';

let _access = null;

export const auth = {
  getAccess:   ()                    => _access,
  getRefresh:  ()                    => localStorage.getItem(KEY),
  hasRefresh:  ()                    => !!localStorage.getItem(KEY),

  setTokens({ accessToken, refreshToken }) {
    _access = accessToken;
    if (refreshToken) localStorage.setItem(KEY, refreshToken);
  },

  clearTokens() {
    _access = null;
    localStorage.removeItem(KEY);
  },
};
