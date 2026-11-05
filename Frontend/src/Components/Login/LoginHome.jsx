import React from "react";
import { useNavigate } from "react-router-dom";
import Input from "../Forms/Input";
import ButtonRegister from "../Forms/ButtonRegister";
import ButtonLogin from "../Forms/ButtonLogin";
import useForm from "../../Hooks/useForm";
import useFormSubmit from "../../Hooks/useFormSubmit";

import { UserContext } from "../../Context/UserContext";
import Error from "../Helper/Error";
import useFetch from "../../Hooks/useFetch";
import { USER_POST, PASSWORD_LOST, PASSWORD_RESET } from "../../Api";
import styles from "./LoginHome.module.css";
import stylesBtn from "../Forms/Button.module.css";
import Close from "../Helper/Close";

const LoginHome = () => {
  const [isPasswordRecovery, setIsPasswordRecovery] = React.useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = React.useState(false);
  const [isPasswordReset, setIsPasswordReset] = React.useState(false);
  const [resetKey, setResetKey] = React.useState("");
  const [resetLogin, setResetLogin] = React.useState("");
  const [resetSuccessNotice, setResetSuccessNotice] = React.useState(false);
  const navigate = useNavigate();

  const { userLogin, enterDemoSession } = React.useContext(UserContext);
  const [loginLoading, setLoginLoading] = React.useState(false);
  const [loginError, setLoginError] = React.useState(null);
  const [loginTouched, setLoginTouched] = React.useState(false);

  // Verificar se está acessando via link de reset
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get("key");
    const login = params.get("login");
    if (key && login) {
      setResetKey(key);
      setResetLogin(login);
      setIsPasswordReset(true);
    }
  }, []);

  // ======================
  // LOGIN (senha opcional → entra como visitante)
  // ======================
  const username = useForm("email");
  const password = useForm();

  /** Entra com credenciais ou, sem senha, como visitante (sem API). */
  async function handleLogin(event) {
    event.preventDefault();
    setLoginTouched(true);
    setLoginError(null);

    const hasPassword = Boolean(String(password.value || "").trim());

    // Sem senha: acesso livre para demonstração no portfólio / Pages.
    if (!hasPassword) {
      setLoginLoading(true);
      try {
        enterDemoSession();
        navigate("/tutorial", { replace: true });
      } finally {
        setLoginLoading(false);
      }
      return;
    }

    if (!username.value || !username.validate()) {
      setLoginError("Preencha um email válido para entrar com senha.");
      return;
    }

    setLoginLoading(true);
    try {
      await userLogin(username.value, password.value);
      navigate("/gerar-bpmn");
    } catch (err) {
      setLoginError(err?.message || "Não foi possível entrar. Tente novamente.");
    } finally {
      setLoginLoading(false);
    }
  }

  // ======================
  // CADASTRO
  // ======================
  const usernameCreate = useForm();
  const emailCreate = useForm("email");
  const passwordCreate = useForm("password");
  const { request } = useFetch();

  const {
    handleSubmit: handleCreate,
    loading: loadingCreate,
    error: errorCreate,
    success: successCreate,
    touched: touchedCreate,
  } = useFormSubmit({
    fields: {
      nome: usernameCreate,
      email: emailCreate,
      senha: passwordCreate,
    },
    onSubmit: async () => {
      const signupEmail = emailCreate.value;
      const signupPassword = passwordCreate.value;

      const { url, options } = USER_POST({
        nome: usernameCreate.value,
        email: signupEmail,
        senha: signupPassword,
        ativo: true,
      });

      const { response } = await request(url, options);
      if (response && response.ok) {
        usernameCreate.reset();
        emailCreate.reset();
        passwordCreate.reset();

        await userLogin(signupEmail, signupPassword);
        setTimeout(() => navigate("/"), 1200);
      }
    },
  });

  // ======================
  // RECUPERAÇÃO DE SENHA
  // ======================
  const loginRecovery = useForm();
  const {
    loading: loadingRecovery,
    error: errorRecovery,
    request: requestRecovery,
  } = useFetch();

  async function handlePasswordRecovery(event) {
    event.preventDefault();
    if (loginRecovery.validate()) {
      const { url, options } = PASSWORD_LOST({
        login: loginRecovery.value,
        url: window.location.href.replace("login", "login/resetar"),
      });
      const { response } = await requestRecovery(url, options);
      if (response && response.ok) {
        setShowSuccessMessage(true);
      }
    }
  }

  const handleTryAgain = () => {
    setShowSuccessMessage(false);
    loginRecovery.setValue("");
  };

  // ======================
  // RESET DE SENHA
  // ======================
  const newPassword = useForm("password");
  const confirmPassword = useForm();
  const [passwordMatchError, setPasswordMatchError] = React.useState("");
  const {
    loading: loadingReset,
    error: errorReset,
    request: requestReset,
  } = useFetch();

  async function handlePasswordReset(event) {
    event.preventDefault();

    if (newPassword.value !== confirmPassword.value) {
      setPasswordMatchError("As senhas não coincidem");
      return;
    }

    setPasswordMatchError("");

    if (newPassword.validate() && confirmPassword.validate()) {
      const { url, options } = PASSWORD_RESET({
        login: resetLogin,
        key: resetKey,
        password: newPassword.value,
      });
      const { response } = await requestReset(url, options);
      if (response && response.ok) {
        setResetSuccessNotice(true);
      }
    }
  }

  return (
    <section className={styles.loginHome}>
      <div className={styles.loginContainer}>
        {/* Painel esquerdo */}
        <div className={styles.loginPanel}>
          {isPasswordReset ? (
            <>
              <h1 className={styles.title}>Redefinir Senha</h1>
              <form className={styles.form} onSubmit={handlePasswordReset}>
                <Input
                  placeholder="Nova senha"
                  type="password"
                  {...newPassword}
                />
                <Input
                  placeholder="Confirmar senha"
                  type="password"
                  {...confirmPassword}
                />
                {passwordMatchError && <p>{passwordMatchError}</p>}
                <div className={styles.buttonRow}>
                  <ButtonLogin
                    className={stylesBtn.outline}
                    disabled={loadingReset}
                  >
                    {loadingReset ? "Redefinindo..." : "Redefinir Senha"}
                  </ButtonLogin>
                </div>
                <Error error={errorReset} />
              </form>
            </>
          ) : isPasswordRecovery ? (
            <>
              <h1 className={styles.title}>Recuperar Senha</h1>
              {showSuccessMessage ? (
                <>
                  <div className={styles.buttonRow}>
                    <ButtonLogin
                      className={stylesBtn.outline}
                      onClick={handleTryAgain}
                    >
                      Enviar novamente
                    </ButtonLogin>
                  </div>
                  <div className={styles.buttonRow}>
                    <button
                      className={styles.backButton}
                      type="button"
                      onClick={() => setIsPasswordRecovery(false)}
                    >
                      Voltar para Login
                    </button>
                  </div>
                </>
              ) : (
                <form onSubmit={handlePasswordRecovery}>
                  <Input placeholder="Email" {...loginRecovery} />
                  <div className={styles.buttonRow}>
                    <ButtonLogin
                      className={stylesBtn.outline}
                      disabled={loadingRecovery}
                    >
                      {loadingRecovery ? "Enviando..." : "Enviar Email"}
                    </ButtonLogin>
                  </div>
                  <p
                    className={styles.forgotPassword}
                    style={{
                      marginTop: "1.5rem",
                      fontSize: "1rem",
                      textAlign: "center",
                      cursor: "pointer",
                      color: "#fff",
                      textDecoration: "underline",
                      fontWeight: "bold",
                    }}
                    onClick={() => setIsPasswordRecovery(false)}
                  >
                    Voltar para Login
                  </p>
                  <Error error={errorRecovery} />
                </form>
              )}
            </>
          ) : (
            <>
              <h1 className={styles.title}>Bem-vindo!</h1>
              <form onSubmit={handleLogin}>
                <Input
                  placeholder="Email (opcional)"
                  {...username}
                  error={
                    loginTouched && password.value && !username.value
                      ? "Preencha o email"
                      : username.error
                  }
                />
                <Input
                  placeholder="Senha (deixe em branco para entrar sem senha)"
                  type="password"
                  {...password}
                />
                <p
                  style={{
                    color: "rgba(255,255,255,0.85)",
                    fontSize: "0.9rem",
                    textAlign: "center",
                    margin: "0.75rem 0 0",
                  }}
                >
                  Pode clicar em <strong>Entrar</strong> sem preencher nada.
                </p>
                <div className={styles.buttonRow}>
                  <ButtonLogin
                    className={stylesBtn.outline}
                    disabled={loginLoading}
                  >
                    {loginLoading ? "Carregando..." : "Entrar"}
                  </ButtonLogin>
                </div>
                <Error error={loginError} />
              </form>
              <p
                className={styles.forgotPassword}
                style={{
                  marginTop: "2.5rem",
                  fontSize: "1rem",
                  textAlign: "center",
                }}
              >
                Esqueceu a sua senha?{" "}
                <span
                  className={styles.cliqueAqui}
                  onClick={() => setIsPasswordRecovery(true)}
                >
                  CLIQUE AQUI!
                </span>
              </p>
            </>
          )}
        </div>

        {/* Painel direito (Cadastro) */}
        <div className={styles.signupPanel}>
          <h1 className={styles.title}>Cadastrar-se</h1>
          <form onSubmit={handleCreate}>
            <Input
              placeholder="Nome"
              {...usernameCreate}
              error={
                touchedCreate && !usernameCreate.value
                  ? "Preencha o nome"
                  : undefined
              }
            />
            <Input
              placeholder="Email"
              {...emailCreate}
              error={
                touchedCreate && !emailCreate.value
                  ? "Preencha o email"
                  : emailCreate.error
              }
            />
            <Input
              placeholder="Senha"
              type="password"
              {...passwordCreate}
              error={
                touchedCreate && !passwordCreate.value
                  ? "Preencha a senha"
                  : passwordCreate.error
              }
            />
            <div className={styles.buttonRow}>
              <ButtonRegister
                className={stylesBtn.primary}
                disabled={loadingCreate}
              >
                {loadingCreate ? "Cadastrando..." : "Inscrever-se"}
              </ButtonRegister>
            </div>
            <Error error={errorCreate} />
            {successCreate && <p>Conta criada com sucesso!</p>}
          </form>
        </div>
      </div>

      {resetSuccessNotice ? (
        <Close
          title="Sucesso"
          message="Senha redefinida com sucesso!"
          onConfirm={() => {
            setResetSuccessNotice(false);
            navigate("/login");
            window.location.reload();
          }}
          onCancel={() => {
            setResetSuccessNotice(false);
            navigate("/login");
            window.location.reload();
          }}
          confirmLabel="OK"
          hideCancel
        />
      ) : null}
    </section>
  );
};

export default LoginHome;
