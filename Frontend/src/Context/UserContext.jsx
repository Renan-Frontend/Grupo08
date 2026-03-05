import React, { createContext, useEffect, useState } from 'react';
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

export const UserStorage = ({ children }) => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // API proxy: login
  const userLogin = async (username, password) => {
    const { url, options } = TOKEN_POST({ username, password });
    const res = await fetch(url, options);
    if (!res.ok) throw new Error('Usuário ou senha incorretos');
    const data = await res.json();
    const token = data.access_token;
    window.sessionStorage.setItem('token', token);
    window.localStorage.setItem('token', token);
    // Buscar e setar o usuário logado imediatamente após login
    const userData = await getUser(token);
    setUser(userData);
    return token;
  };

  // API proxy: logout (just remove token)
  const userLogout = () => {
    window.sessionStorage.removeItem('token');
    window.localStorage.removeItem('token');
    setUser(null);
  };

  // API proxy: get current user info
  const getUser = async (token) => {
    const { url, options } = USER_ME(token);
    const res = await fetch(url, options);
    if (!res.ok) throw new Error('Erro ao buscar usuário');
    return await res.json();
  };

  useEffect(() => {
    let isMounted = true;

    const restoreUserSession = async () => {
      try {
        const sessionToken = window.sessionStorage.getItem('token');

        if (!sessionToken) {
          window.localStorage.removeItem('token');
          if (isMounted) setUser(null);
          return;
        }

        const userData = await getUser(sessionToken);
        if (!isMounted) return;

        setUser(userData);
        window.localStorage.setItem('token', sessionToken);
      } catch (error) {
        window.sessionStorage.removeItem('token');
        window.localStorage.removeItem('token');
        if (isMounted) setUser(null);
      } finally {
        if (isMounted) setAuthLoading(false);
      }
    };

    restoreUserSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // API proxy: create user
  const createUser = async (user, token) => {
    const { url, options } = USER_POST(user, token);
    const res = await fetch(url, options);
    if (!res.ok) throw new Error('Erro ao criar usuário');
    return await res.json();
  };

  // API proxy: update user
  const updateUser = async (id, user, token) => {
    const { url, options } = USER_PUT(id, user, token);
    const res = await fetch(url, options);
    if (!res.ok) throw new Error('Erro ao atualizar usuário');
    return await res.json();
  };

  // API proxy: delete user
  const deleteUser = async (id, token) => {
    const { url, options } = USER_DELETE(id, token);
    const res = await fetch(url, options);
    if (!res.ok) throw new Error('Erro ao deletar usuário');
    return true;
  };

  // API proxy: get all users
  const getAllUsers = async (token) => {
    const { url, options } = USER_GET(token);
    const res = await fetch(url, options);
    if (!res.ok) throw new Error('Erro ao buscar usuários');
    return await res.json();
  };

  // API proxy: get user by id
  const getUserById = async (id, token) => {
    const { url, options } = USER_GET_BY_ID(id, token);
    const res = await fetch(url, options);
    if (!res.ok) throw new Error('Erro ao buscar usuário');
    return await res.json();
  };

  return (
    <UserContext.Provider
      value={{
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
      }}
    >
      {children}
    </UserContext.Provider>
  );
};
