import React from 'react';
import { Link } from 'react-router-dom';
import Input from '../Forms/Input';
import Button from '../Forms/Button';
import useForm from '../../Hooks/useForm';
import Error from '../Helper/Error';
import styles from './LoginForm.module.css';
import stylesBtn from '../Forms/Button.module.css';

const LoginPasswordLost = () => {
  const login = useForm();
  const [error, setError] = React.useState(null);
  const [success, setSuccess] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setTouched(true);
    setError(null);

    if (!login.value) {
      setError('Preencha o campo email ou usuário.');
      return;
    }

    setLoading(true);

    // Simulação até a API estar disponível
    setTimeout(() => {
      setSuccess(true);
      setLoading(false);
    }, 800);
  }

  return (
    <section className={styles.form}>
      <h1 className={styles.title}>Perdeu a senha?</h1>

      {success ? (
        <p style={{ color: '#4c1' }}>
          Se o usuário existir, um email de recuperação será enviado.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <Input
            label="Email / Usuário"
            type="text"
            name="login"
            {...login}
            error={
              touched && !login.value
                ? 'Preencha o campo email ou usuário.'
                : login.error
            }
          />

          {loading ? (
            <Button disabled className={stylesBtn.primary}>
              Enviando...
            </Button>
          ) : (
            <Button className={stylesBtn.primary}>Enviar Email</Button>
          )}

          <Error error={error} />
        </form>
      )}

      <Link className={styles.link} to="/login">
        Voltar para Login
      </Link>
    </section>
  );
};

export default LoginPasswordLost;
