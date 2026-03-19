import React from 'react';
import Error from '../Helper/Error';
import useForm from '../../Hooks/useForm';
import useFormSubmit from '../../Hooks/useFormSubmit';
import { useNavigate, Navigate } from 'react-router-dom';
import { UserContext } from '../../Context/UserContext';
import styles from './CriarUsuario.module.css';

const CriarUsuario = () => {
  const username = useForm();
  const email = useForm('email');
  const password = useForm('password');
  const [nivel, setNivel] = React.useState('1');
  const [cargo, setCargo] = React.useState('');
  const [adminNew, setAdminNew] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  const { createUser, user } = React.useContext(UserContext);
  const navigate = useNavigate();

  const token =
    window.sessionStorage.getItem('token') ||
    window.localStorage.getItem('token');

  const isAdmin = user?.role === 'admin' || user?.admin === true;
  const canCreate = isAdmin || Number(user?.nivel) >= 3;

  if (!canCreate) return <Navigate to="/usuarios" replace />;

  const { handleSubmit, loading, error, touched } = useFormSubmit({
    fields: {
      nome: username,
      email: email,
      senha: password,
    },
    onSubmit: async () => {
      await createUser(
        {
          nome: username.value,
          email: email.value,
          senha: password.value,
          ativo: true,
          nivel,
          cargo,
          admin: adminNew,
        },
        token,
      );
      setSuccess(true);
      setTimeout(() => navigate('/usuarios'), 1200);
    },
  });

  return (
    <section className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>Criar Usuário</h1>
          <p className={styles.pageDesc}>
            Preencha os dados para cadastrar um novo usuário no sistema.
          </p>
        </div>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/usuarios')}
        >
          ← Voltar
        </button>
      </div>

      <div className={styles.innerCard}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <Error error={error} />

          <div className={styles.fieldFull}>
            <label className={styles.label} htmlFor="username">
              Nome
            </label>
            <input
              id="username"
              className={styles.input}
              placeholder="Nome"
              type="text"
              name="username"
              value={username.value}
              onChange={username.onChange}
              onBlur={username.onBlur}
            />
            {touched && !username.value && (
              <span className={styles.fieldError}>Preencha o nome</span>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className={styles.input}
              placeholder="Email"
              type="email"
              name="email"
              value={email.value}
              onChange={email.onChange}
              onBlur={email.onBlur}
            />
            {(touched && !email.value) || email.error ? (
              <span className={styles.fieldError}>
                {touched && !email.value ? 'Preencha o email' : email.error}
              </span>
            ) : null}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              className={styles.input}
              placeholder="Senha"
              type="password"
              name="password"
              value={password.value}
              onChange={password.onChange}
              onBlur={password.onBlur}
            />
            {(touched && !password.value) || password.error ? (
              <span className={styles.fieldError}>
                {touched && !password.value
                  ? 'Preencha a senha'
                  : password.error}
              </span>
            ) : null}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="nivel">
              Nível de acesso
            </label>
            <select
              id="nivel"
              className={styles.select}
              value={nivel}
              onChange={(e) => setNivel(e.target.value)}
            >
              <option value="1">Nível 1 — Apenas visualizar</option>
              <option value="2">Nível 2 — Visualizar e editar</option>
              <option value="3">Nível 3 — Controle geral</option>
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="cargo">
              Cargo
            </label>
            <input
              id="cargo"
              className={styles.input}
              placeholder="Ex: Analista, Gerente…"
              type="text"
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
            />
          </div>

          <div className={styles.checkboxRow}>
            <input
              id="adminNew"
              type="checkbox"
              className={styles.checkbox}
              checked={adminNew}
              onChange={(e) => setAdminNew(e.target.checked)}
            />
            <label htmlFor="adminNew" className={styles.checkboxLabel}>
              Administrador
            </label>
          </div>

          <div className={styles.btnRow}>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={loading}
            >
              {loading ? 'Criando...' : 'Criar Usuário'}
            </button>
          </div>

          {success && !error && (
            <p className={styles.successMsg}>✅ Usuário criado com sucesso!</p>
          )}
        </form>
      </div>
    </section>
  );
};

export default CriarUsuario;
