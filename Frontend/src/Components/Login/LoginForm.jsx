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
  const [slowWarning, setSlowWarning] = React.useState(false);
  const [retryWarning, setRetryWarning] = React.useState(false);

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
      navigate('/ia');
    },
  });

  React.useEffect(() => {
    if (!loading) {
      setSlowWarning(false);
      setRetryWarning(false);
      return;
    }
    const slowTimer = window.setTimeout(() => setSlowWarning(true), 5000);
    const retryTimer = window.setTimeout(() => setRetryWarning(true), 75000);
    return () => {
      window.clearTimeout(slowTimer);
      window.clearTimeout(retryTimer);
    };
  }, [loading]);

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
          <>
            <Button disabled>Carregando...</Button>
            {retryWarning ? (
              <p className={styles.warmupWarning}>
                🔄 Reconectando ao servidor, aguarde mais um momento...
              </p>
            ) : slowWarning ? (
              <p className={styles.warmupWarning}>
                ⏳ O servidor está acordando (pode levar até 1 min na primeira
                vez)...
              </p>
            ) : null}
          </>
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
