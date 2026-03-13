import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  TOKEN_POST,
  USER_ME,
  USER_POST,
  USER_PUT,
  USER_DELETE,
  USER_GET,
  USER_GET_BY_ID,
} from '../Api';

export const UserContext = createContext();
const USER_SESSION_CACHE_KEY = 'user_session_cache_v1';
const AUTH_REQUEST_TIMEOUT_MS = 8000;
const LOGIN_REQUEST_TIMEOUT_MS = 12000;

const readCachedUser = () => {
  try {
    const raw = window.sessionStorage.getItem(USER_SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
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

    if (!res.ok) throw new Error('Erro ao buscar usuário');
    return await res.json();
  }, []);

  // API proxy: login
  const userLogin = useCallback(
    async (username, password) => {
      const { url, options } = TOKEN_POST({ username, password });
      const controller = new AbortController();
      const timeoutId = window.setTimeout(
        () => controller.abort(),
        LOGIN_REQUEST_TIMEOUT_MS,
      );

      try {
        const res = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Usuário ou senha incorretos');
        const data = await res.json();
        const token = data.access_token;
        window.sessionStorage.setItem('token', token);
        // Clear legacy persistent token so the app asks login again
        // after browser restart.
        window.localStorage.removeItem('token');

        const userDataFromLogin =
          data?.user && typeof data.user === 'object' ? data.user : null;
        const userData = userDataFromLogin || (await getUser(token));

        setUser(userData);
        writeCachedUser(userData);
        return token;
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new Error(
            'A autenticacao demorou demais. Tente novamente em alguns segundos.',
          );
        }
        if (error instanceof TypeError) {
          throw new Error(
            'Falha de conexao com a API. Verifique VITE_API_URL e ALLOWED_ORIGINS.',
          );
        }
        throw error;
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    [getUser],
  );

  // API proxy: logout (just remove token)
  const userLogout = useCallback(() => {
    window.sessionStorage.removeItem('token');
    window.localStorage.removeItem('token');
    clearCachedUser();
    setUser(null);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const restoreUserSession = async () => {
      try {
        const legacyPersistentToken = window.localStorage.getItem('token');
        const sessionToken = window.sessionStorage.getItem('token');

        // If the user still has the legacy persistent token, invalidate
        // current auth once so the app asks for account credentials again.
        if (legacyPersistentToken) {
          window.sessionStorage.removeItem('token');
          window.localStorage.removeItem('token');
          clearCachedUser();
          if (isMounted) setUser(null);
          return;
        }

        // Remove legacy persisted cache key from localStorage.
        window.localStorage.removeItem(USER_SESSION_CACHE_KEY);

        if (!sessionToken) {
          window.sessionStorage.removeItem('token');
          if (isMounted) setUser(null);
          return;
        }

        const cachedUser = readCachedUser();
        if (cachedUser && isMounted) {
          setUser(cachedUser);
        }

        const userData = await getUser(sessionToken);
        if (!isMounted) return;

        setUser(userData);
        writeCachedUser(userData);
      } catch (error) {
        // If we already have a cached user, keep the session alive
        // instead of logging out on a transient network/timeout error.
        const cachedUser = readCachedUser();
        if (cachedUser) {
          if (isMounted) setUser(cachedUser);
          return;
        }

        window.sessionStorage.removeItem('token');
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
    if (!res.ok) throw new Error('Erro ao criar usuário');
    return await res.json();
  }, []);

  // API proxy: update user
  const updateUser = useCallback(async (id, user, token) => {
    const { url, options } = USER_PUT(id, user, token);
    const res = await fetch(url, options);
    if (!res.ok) throw new Error('Erro ao atualizar usuário');
    return await res.json();
  }, []);

  // API proxy: delete user
  const deleteUser = useCallback(async (id, token) => {
    const { url, options } = USER_DELETE(id, token);
    const res = await fetch(url, options);
    if (!res.ok) throw new Error('Erro ao deletar usuário');
    return true;
  }, []);

  // API proxy: get all users
  const getAllUsers = useCallback(async (token) => {
    const { url, options } = USER_GET(token);
    const res = await fetch(url, options);
    if (!res.ok) throw new Error('Erro ao buscar usuários');
    return await res.json();
  }, []);

  // API proxy: get user by id
  const getUserById = useCallback(async (id, token) => {
    const { url, options } = USER_GET_BY_ID(id, token);
    const res = await fetch(url, options);
    if (!res.ok) throw new Error('Erro ao buscar usuário');
    return await res.json();
  }, []);

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
    ],
  );

  return (
    <UserContext.Provider value={contextValue}>{children}</UserContext.Provider>
  );
};
