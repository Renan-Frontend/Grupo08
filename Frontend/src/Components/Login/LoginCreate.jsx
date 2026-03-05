import React from 'react';
import Input from '../Forms/Input';
import Button from '../Forms/Button';
import Error from '../Helper/Error';
import useForm from '../../Hooks/useForm';
import useFormSubmit from '../../Hooks/useFormSubmit';

import { useNavigate } from 'react-router-dom';
import { UserContext } from '../../Context/UserContext';

const LoginCreate = () => {
  const username = useForm();
  const email = useForm('email');
  const password = useForm('password');

  const { createUser, userLogin } = React.useContext(UserContext);
  const navigate = useNavigate();

  const { handleSubmit, loading, error, success, touched } = useFormSubmit({
    fields: {
      nome: username,
      email: email,
      senha: password,
    },
    onSubmit: async () => {
      await createUser({
        nome: username.value,
        email: email.value,
        senha: password.value,
        ativo: true,
      });

      await userLogin(email.value, password.value);
      setTimeout(() => navigate('/'), 1200);
    },
  });

  return (
    <section className="animeLeft">
      <h1 className="title">Cadastre-se</h1>

      <form onSubmit={handleSubmit}>
        <Error error={error} />

        <Input
          label="Usuário"
          type="text"
          name="username"
          {...username}
          error={touched && !username.value ? 'Preencha o nome' : undefined}
        />

        <Input
          label="Email"
          type="email"
          name="email"
          {...email}
          error={touched && !email.value ? 'Preencha o email' : email.error}
        />

        <Input
          label="Senha"
          type="password"
          name="password"
          {...password}
          error={
            touched && !password.value ? 'Preencha a senha' : password.error
          }
        />

        {loading ? (
          <Button disabled>Cadastrando...</Button>
        ) : (
          <Button>Cadastrar</Button>
        )}

        {success && !error && (
          <p style={{ color: 'green', marginTop: '1rem' }}>
            Conta criada com sucesso!
          </p>
        )}
      </form>
    </section>
  );
};

export default LoginCreate;
