import React from 'react';
import Input from '../Forms/Input';
import Button from '../Forms/Button';
import Error from '../Helper/Error';
import useForm from '../../Hooks/useForm';
import useFormSubmit from '../../Hooks/useFormSubmit';

import { Link, useNavigate } from 'react-router-dom';
import { UserContext } from '../../Context/UserContext';
import useOnline from '../../Hooks/useOnline';

import styles from './Login.module.css';
import stylesBtn from '../Forms/Button.module.css';

const LoginForm = () => {
  const email = useForm('email');
  const password = useForm();

  const { userLogin, getUser } = React.useContext(UserContext);
  const isOnline = useOnline();
  const navigate = useNavigate();

  const { handleSubmit, loading, error, touched } = useFormSubmit({
    fields: {
      email: email,
      senha: password,
    },
    onSubmit: async () => {
      const token = await userLogin(email.value, password.value);
      await getUser(token);
      navigate('/gerar-bpmn');
    },
  });

  return (
    <section className="animeLeft">
      <h1 className="title">Login</h1>

      {!isOnline && (
        <div className={styles.offlineWarning}>
          <span>📵</span>
          <div>
            <strong>Modo Offline</strong>
            <p>Você pode fazer login se já tiver acessado antes.</p>
          </div>
        </div>
      )}

      <form className={styles.form} onSubmit={handleSubmit}>
        <Error error={error} />

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
          name="senha"
          {...password}
          error={
            touched && !password.value ? 'Preencha a senha' : password.error
          }
        />

        {loading ? (
          <Button disabled>Carregando...</Button>
        ) : (
          <Button>Entrar</Button>
        )}
      </form>

      <Link className={styles.perdeu} to="/login/perdeu">
        Perdeu a Senha?
      </Link>

      <div className={styles.cadastro}>
        <div>
          <h2 className={styles.subtitle}>Cadastre-se</h2>
          <p>Ainda não possui conta? Cadastre-se no site.</p>
          <Link className={stylesBtn.button} to="/login/criar">
            Cadastro
          </Link>
        </div>
      </div>
    </section>
  );
};

export default LoginForm;
