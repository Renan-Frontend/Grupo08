import React from 'react';
import { useNavigate } from 'react-router-dom';
import Input from '../Forms/Input';
import Button from '../Forms/Button';
import useForm from '../../Hooks/useForm';
import Error from '../Helper/Error';
import styles from './LoginForm.module.css';
import stylesBtn from '../Forms/Button.module.css';

const LoginPasswordReset = () => {
  const password = useForm('password');
  const [login, setLogin] = React.useState('');
  const [key, setKey] = React.useState('');
  const [error, setError] = React.useState(null);
  const [success, setSuccess] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const keyParam = params.get('key');
    const loginParam = params.get('login');

    if (keyParam) setKey(keyParam);
    if (loginParam) setLogin(loginParam);
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setTouched(true);
    setError(null);

    if (!password.value) {
      setError('Preencha a nova senha.');
      return;
    }

    if (!password.validate()) {
      return;
    }

    setLoading(true);

    // Simulação até a API estar disponível
    setTimeout(() => {
      setSuccess(true);
      setLoading(false);

      setTimeout(() => {
        navigate('/login');
      }, 1500);
    }, 800);
  }

  return (
    <section className={styles.form}>
      <h1 className={styles.title}>Redefinir Senha</h1>

      {success ? (
        <p style={{ color: '#4c1' }}>
          Senha redefinida com sucesso! Redirecionando...
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <Input
            label="Nova Senha"
            type="password"
            name="password"
            {...password}
            error={
              touched && !password.value
                ? 'Preencha a nova senha.'
                : password.error
            }
          />

          {loading ? (
            <Button disabled className={stylesBtn.primary}>
              Redefinindo...
            </Button>
          ) : (
            <Button className={stylesBtn.primary}>Redefinir</Button>
          )}

          <Error error={error} />
        </form>
      )}
    </section>
  );
};

export default LoginPasswordReset;
