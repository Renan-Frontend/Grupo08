import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  TOKEN_POST,
  USER_ME,
  USER_POST,
  USER_PUT,
  USER_DELETE,
  USER_GET,
  USER_GET_BY_ID,
  AUTH_REFRESH,
} from "../Api";

export const UserContext = createContext({
  user: null,
  authLoading: true,
  userLogin: () => {},
  userLogout: () => {},
  getUser: () => {},
  createUser: () => {},
  updateUser: () => {},
  deleteUser: () => {},
  getAllUsers: () => {},
  getUserById: () => {},
  refreshAccessToken: () => {},
  fetchWithAuth: async () => new Response(null, { status: 401 }),
  hasPermission: () => false,
  hasRole: () => false,
});
const USER_SESSION_CACHE_KEY = "user_session_cache_v1";
const AUTH_REQUEST_TIMEOUT_MS = 12000;
const LOGIN_REQUEST_TIMEOUT_MS = 10000; // first attempt; cold-start retry uses 20s

// Offline session: persists token + user in localStorage so the app works
// after a browser restart when there is no network connection.
// Only used when navigator.onLine === false — online flow is unchanged.
const OFFLINE_SESSION_KEY = "offline_session_v1";
const OFFLINE_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const readOfflineSession = () => {
  try {
    const raw = window.localStorage.getItem(OFFLINE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { token, user, savedAt } = parsed;
    if (!token || !user || !savedAt) return null;
    if (Date.now() - savedAt > OFFLINE_SESSION_TTL_MS) {
      window.localStorage.removeItem(OFFLINE_SESSION_KEY);
      return null;
    }
    return { token, user };
  } catch {
    return null;
  }
};

const writeOfflineSession = (token, userData, refreshToken = null) => {
  try {
    window.localStorage.setItem(
      OFFLINE_SESSION_KEY,
      JSON.stringify({
        token,
        refreshToken,
        user: userData,
        savedAt: Date.now(),
      }),
    );
  } catch {
    // no-op
  }
};

const clearOfflineSession = () => {
  try {
    window.localStorage.removeItem(OFFLINE_SESSION_KEY);
  } catch {
    // no-op
  }
};

const readCachedUser = () => {
  try {
    const raw = window.sessionStorage.getItem(USER_SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const writeCachedUser = (userData) => {
  try {
    const serialized = JSON.stringify(userData || null);
    window.sessionStorage.setItem(USER_SESSION_CACHE_KEY, serialized);
  } catch {
    // no-op
  }
};

const clearCachedUser = () => {
  try {
    window.sessionStorage.removeItem(USER_SESSION_CACHE_KEY);
    window.localStorage.removeItem(USER_SESSION_CACHE_KEY);
  } catch {
    // no-op
  }
};

export const UserStorage = ({ children }) => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // API proxy: get current user info
  const getUser = useCallback(async (token) => {
    const { url, options } = USER_ME(token);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      AUTH_REQUEST_TIMEOUT_MS,
    );

    let res;
    try {
      res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }

    if (!res.ok) throw new Error("Erro ao buscar usuário");
    return await res.json();
  }, []);

  // API proxy: login
  const userLogin = useCallback(
    async (username, password) => {
      const { url, options } = TOKEN_POST({ username, password });

      // Single fetch attempt with its own timeout + abort controller
      const attemptFetch = async (timeoutMs = LOGIN_REQUEST_TIMEOUT_MS) => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(
          () => controller.abort(),
          timeoutMs,
        );
        try {
          const res = await fetch(url, {
            ...options,
            signal: controller.signal,
          });
          if (!res.ok) throw new Error("Usuário ou senha incorretos");
          return await res.json();
        } finally {
          window.clearTimeout(timeoutId);
        }
      };

      let data;
      try {
        data = await attemptFetch();
      } catch (firstError) {
        if (firstError?.name !== "AbortError") {
          if (firstError instanceof TypeError) {
            throw new Error(
              "Falha de conexao com a API. Verifique VITE_API_URL e ALLOWED_ORIGINS.",
            );
          }
          throw firstError;
        }
        // Backend em cold start (Render) — tenta novamente automaticamente
        try {
          data = await attemptFetch(20000);
        } catch (retryError) {
          if (retryError?.name === "AbortError") {
            throw new Error(
              "A autenticacao demorou demais. Tente novamente em alguns segundos.",
            );
          }
          if (retryError instanceof TypeError) {
            throw new Error(
              "Falha de conexao com a API. Verifique VITE_API_URL e ALLOWED_ORIGINS.",
            );
          }
          throw retryError;
        }
      }

      const token = data.access_token;
      const refreshToken = data.refresh_token || null;
      window.sessionStorage.setItem("token", token);
      if (refreshToken) {
        window.sessionStorage.setItem("refresh_token", refreshToken);
      }
      // Clear legacy persistent token so the app asks login again
      // after browser restart.
      window.localStorage.removeItem("token");

      const userDataFromLogin =
        data?.user && typeof data.user === "object" ? data.user : null;
      const userData = userDataFromLogin || (await getUser(token));

      setUser(userData);
      writeCachedUser(userData);
      // Persist offline session so the app can work after a browser
      // restart without network connection (read-only mode).
      writeOfflineSession(token, userData, refreshToken);
      return token;
    },
    [getUser],
  );

  // API proxy: logout (just remove token)
  const userLogout = useCallback(() => {
    window.sessionStorage.removeItem("token");
    window.sessionStorage.removeItem("refresh_token");
    window.localStorage.removeItem("token");
    clearCachedUser();
    clearOfflineSession();
    setUser(null);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const restoreUserSession = async () => {
      try {
        const legacyPersistentToken = window.localStorage.getItem("token");
        const sessionToken = window.sessionStorage.getItem("token");

        // If the user still has the legacy persistent token, invalidate
        // current auth once so the app asks for account credentials again.
        if (legacyPersistentToken) {
          window.sessionStorage.removeItem("token");
          window.localStorage.removeItem("token");
          clearCachedUser();
          if (isMounted) setUser(null);
          return;
        }

        // Remove legacy persisted cache key from localStorage.
        window.localStorage.removeItem(USER_SESSION_CACHE_KEY);

        if (!sessionToken) {
          // Offline recovery: no session token but we have a persisted
          // offline session — restore it without any network call.
          if (!navigator.onLine) {
            const offlineSession = readOfflineSession();
            if (offlineSession) {
              window.sessionStorage.setItem("token", offlineSession.token);
              writeCachedUser(offlineSession.user);
              if (isMounted) setUser(offlineSession.user);
              return;
            }
          }
          window.sessionStorage.removeItem("token");
          if (isMounted) setUser(null);
          return;
        }

        const cachedUser = readCachedUser();
        if (cachedUser && isMounted) {
          setUser(cachedUser);
          // NOTE: do NOT set authLoading=false here — the token still
          // needs network validation / refresh.  Other components that
          // guard on authLoading must wait until the token is confirmed.
        }

        // Skip network validation when offline — the cached user is enough.
        // When connectivity is restored the next API call will revalidate.
        if (!navigator.onLine) {
          if (!cachedUser) {
            const offlineSession = readOfflineSession();
            if (offlineSession && isMounted) setUser(offlineSession.user);
            else if (isMounted) setUser(null);
          }
          return;
        }

        let activeToken = sessionToken;
        let userData;
        try {
          userData = await getUser(activeToken);
        } catch (_firstErr) {
          // Token may be expired — try refreshing before giving up.
          const refreshToken =
            window.sessionStorage.getItem("refresh_token") ||
            (() => {
              const s = readOfflineSession();
              return s?.refreshToken;
            })();
          if (refreshToken) {
            try {
              const { url: rUrl, options: rOpts } = AUTH_REFRESH(refreshToken);
              const rRes = await fetch(rUrl, rOpts);
              if (rRes.ok) {
                const rData = await rRes.json();
                const newToken = rData.access_token;
                if (newToken) {
                  window.sessionStorage.setItem("token", newToken);
                  activeToken = newToken;
                  userData = await getUser(newToken);
                }
              }
            } catch {
              // refresh failed — fall through
            }
          }
          if (!userData) throw _firstErr;
        }
        if (!isMounted) return;

        setUser(userData);
        writeCachedUser(userData);
        // Keep offline session fresh with the latest user data.
        writeOfflineSession(activeToken, userData);
      } catch (error) {
        // If we already have a cached user, keep the session alive
        // instead of logging out on a transient network/timeout error.
        const cachedUser = readCachedUser();
        if (cachedUser) {
          if (isMounted) setUser(cachedUser);
          return;
        }

        window.sessionStorage.removeItem("token");
        clearCachedUser();
        if (isMounted) setUser(null);
      } finally {
        if (isMounted) setAuthLoading(false);
      }
    };

    restoreUserSession();

    return () => {
      isMounted = false;
    };
  }, [getUser]);

  // API proxy: create user
  const createUser = useCallback(async (user, token) => {
    const { url, options } = USER_POST(user, token);
    const res = await fetch(url, options);
    if (!res.ok) throw new Error("Erro ao criar usuário");
    return await res.json();
  }, []);

  // API proxy: update user
  const updateUser = useCallback(async (id, user, token) => {
    const { url, options } = USER_PUT(id, user, token);
    const res = await fetch(url, options);
    if (!res.ok) throw new Error("Erro ao atualizar usuário");
    return await res.json();
  }, []);

  // API proxy: delete user
  const deleteUser = useCallback(async (id, token) => {
    const { url, options } = USER_DELETE(id, token);
    const res = await fetch(url, options);
    if (!res.ok) throw new Error("Erro ao deletar usuário");
    return true;
  }, []);

  // API proxy: get all users
  const getAllUsers = useCallback(async (token) => {
    const { url, options } = USER_GET(token);
    const res = await fetch(url, options);
    if (!res.ok) throw new Error("Erro ao buscar usuários");
    return await res.json();
  }, []);

  // API proxy: get user by id
  const getUserById = useCallback(async (id, token) => {
    const { url, options } = USER_GET_BY_ID(id, token);
    const res = await fetch(url, options);
    if (!res.ok) throw new Error("Erro ao buscar usuário");
    return await res.json();
  }, []);

  // Refresh access token using refresh_token
  const refreshAccessToken = useCallback(async () => {
    const refreshToken =
      window.sessionStorage.getItem("refresh_token") ||
      (() => {
        const s = readOfflineSession();
        return s?.refreshToken;
      })();
    if (!refreshToken) return null;
    try {
      const { url, options } = AUTH_REFRESH(refreshToken);
      const res = await fetch(url, options);
      if (!res.ok) return null;
      const data = await res.json();
      const newToken = data.access_token;
      if (newToken) {
        window.sessionStorage.setItem("token", newToken);
        // Update offline session with new access token
        if (user) writeOfflineSession(newToken, user, refreshToken);
      }
      return newToken;
    } catch {
      return null;
    }
  }, [user]);

  // Fetch wrapper: auto-refresh token on 401 and retry once
  const fetchWithAuth = useCallback(
    async (requestBuilder, ...builderArgs) => {
      const token = window.sessionStorage.getItem("token");
      const { url, options } = requestBuilder(token, ...builderArgs);
      const res = await fetch(url, options);
      if (res.status === 401) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          const { url: url2, options: opts2 } = requestBuilder(
            newToken,
            ...builderArgs,
          );
          return fetch(url2, opts2);
        }
      }
      return res;
    },
    [refreshAccessToken],
  );

  // Check if current user has a specific permission
  const hasPermission = useCallback(
    (perm) => {
      if (!user) return false;
      const perms = user.permissions || [];
      return perms.includes(perm);
    },
    [user],
  );

  // Check if current user has a specific role
  const hasRole = useCallback(
    (...roles) => {
      if (!user) return false;
      return roles.includes(user.role || "user");
    },
    [user],
  );

  const contextValue = useMemo(
    () => ({
      user,
      authLoading,
      userLogin,
      userLogout,
      getUser,
      createUser,
      updateUser,
      deleteUser,
      getAllUsers,
      getUserById,
      refreshAccessToken,
      fetchWithAuth,
      hasPermission,
      hasRole,
    }),
    [
      user,
      authLoading,
      userLogin,
      userLogout,
      getUser,
      createUser,
      updateUser,
      deleteUser,
      getAllUsers,
      getUserById,
      refreshAccessToken,
      fetchWithAuth,
      hasPermission,
      hasRole,
    ],
  );

  return (
    <UserContext.Provider value={contextValue}>{children}</UserContext.Provider>
  );
};
