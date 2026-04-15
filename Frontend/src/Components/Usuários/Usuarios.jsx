import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Usuarios.module.css';
import { UserContext } from '../../Context/UserContext';
import Close from '../Helper/Close';
import { USER_GET, USER_PUT, USER_DELETE } from '../../Api';

const niveis = [
  {
    value: '1',
    label: 'Nível 1 - Apenas visualizar',
    desc: 'Apenas visualizar',
  },
  {
    value: '2',
    label: 'Nível 2 - Visualizar e editar',
    desc: 'Visualizar e editar',
  },
  {
    value: '3',
    label: 'Nível 3 - Controle geral',
    desc: 'Controle geral',
  },
];

function Usuarios() {
  const [usuarios, setUsuarios] = React.useState({ data: [] });
  const [editingId, setEditingId] = React.useState(null);
  const [nivelEdit, setNivelEdit] = React.useState('');
  const [cargoEdit, setCargoEdit] = React.useState('');
  const [adminEdit, setAdminEdit] = React.useState(false);
  const [deleteUserId, setDeleteUserId] = React.useState(null);

  const navigate = useNavigate();
  const { user } = React.useContext(UserContext);
  const isAdmin = user?.role === 'admin' || user?.admin === true;
  const currentUserId = Number(user?.id);

  const token =
    window.sessionStorage.getItem('token') ||
    window.localStorage.getItem('token');

  const getErrorMessage = async (response) => {
    try {
      const payload = await response.json();
      if (typeof payload?.detail === 'string' && payload.detail.trim()) {
        return payload.detail;
      }
    } catch {
      // no-op
    }
    return 'Não foi possível concluir a operação.';
  };

  const fetchUsuarios = React.useCallback(() => {
    const { url, options } = USER_GET(token);
    const usersUrl = new URL(url);
    usersUrl.searchParams.set('page', '1');
    usersUrl.searchParams.set('limit', '10000');

    fetch(usersUrl.toString(), options)
      .then((res) => res.json())
      .then((data) => setUsuarios(data))
      .catch((err) => console.error('Erro ao buscar usuários:', err));
  }, [token]);

  React.useEffect(() => {
    fetchUsuarios();
  }, [fetchUsuarios]);

  const handleEdit = (usuario) => {
    const targetUserId = Number(usuario.id);
    const isPrincipalAdmin = usuario.is_principal_admin === true;
    const isCurrentPrincipal =
      Number.isFinite(currentUserId) && currentUserId === targetUserId;

    if (isPrincipalAdmin && !isCurrentPrincipal) {
      window.alert(
        'O administrador principal nao pode ser editado por outro administrador.',
      );
      return;
    }

    setEditingId(usuario.id);
    setNivelEdit(String(usuario.nivel));
    setCargoEdit(usuario.cargo || '');
    setAdminEdit(usuario.admin === true || usuario.role === 'admin');
  };

  const handleSave = async (id) => {
    try {
      const { url, options } = USER_PUT(
        id,
        {
          nivel: nivelEdit,
          cargo: cargoEdit,
          admin: adminEdit,
          role: adminEdit ? 'admin' : 'user',
        },
        token,
      );
      const res = await fetch(url, options);

      if (!res.ok) {
        const message = await getErrorMessage(res);
        window.alert(message);
        return;
      }

      setEditingId(null);
      fetchUsuarios();
    } catch (err) {
      console.error('Erro ao atualizar usuário:', err);
    }
  };

  const handleDelete = async (id) => {
    const target = usuarios?.data?.find(
      (item) => Number(item.id) === Number(id),
    );
    if (target?.is_principal_admin === true) {
      window.alert('O administrador principal nao pode ser excluido.');
      setDeleteUserId(null);
      return;
    }

    try {
      const { url, options } = USER_DELETE(id, token);
      const res = await fetch(url, options);

      if (!res.ok) {
        const message = await getErrorMessage(res);
        window.alert(message);
        return;
      }

      fetchUsuarios();
    } catch (err) {
      console.error('Erro ao deletar usuário:', err);
    } finally {
      setDeleteUserId(null);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Administrar usuários</h1>
          <p className={styles.subtitle}>
            Gerencie acessos, cargos e permissões dos usuários.
          </p>
        </div>
        {isAdmin && (
          <button
            className={styles.btnCriar}
            onClick={() => navigate('/usuarios/criar')}
          >
            Criar Usuário
          </button>
        )}
      </div>

      <div className={styles.tableBox}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.nameCol}>Nome</th>
              <th className={styles.emailCol}>Email</th>
              <th className={styles.accessCol}>Nível de Acesso</th>
              <th className={styles.adminCol}>Administrador</th>
              <th className={styles.roleCol}>Cargo</th>
              <th className={styles.dateCol}>Data de cadastro</th>
              {isAdmin && <th className={styles.actionsCol}>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {usuarios.data &&
              usuarios.data.map((usuario) => {
                const nivel = niveis.find(
                  (n) => n.value === String(usuario.nivel),
                );
                const targetUserId = Number(usuario.id);
                const isPrincipalAdmin = usuario.is_principal_admin === true;
                const isCurrentPrincipal =
                  Number.isFinite(currentUserId) &&
                  currentUserId === targetUserId;
                const canEditThisUser = !isPrincipalAdmin || isCurrentPrincipal;
                const canDeleteThisUser = !isPrincipalAdmin;
                return (
                  <tr key={usuario.id}>
                    <td className={styles.nameCol}>{usuario.nome}</td>
                    <td>{usuario.email}</td>
                    <td>
                      {editingId === usuario.id ? (
                        <select
                          className={styles.select}
                          name="nivelEdit"
                          value={nivelEdit}
                          onChange={(e) => setNivelEdit(e.target.value)}
                        >
                          {niveis.map((n) => (
                            <option key={n.value} value={n.value}>
                              {n.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <>
                          {nivel?.label || 'Nível não definido'}
                          <div className={styles.desc}>{nivel?.desc}</div>
                        </>
                      )}
                    </td>
                    <td>
                      {editingId === usuario.id ? (
                        <select
                          className={styles.select}
                          name="adminEdit"
                          value={adminEdit ? 'sim' : 'nao'}
                          onChange={(e) =>
                            setAdminEdit(e.target.value === 'sim')
                          }
                        >
                          <option value="sim">Sim</option>
                          <option value="nao">Não</option>
                        </select>
                      ) : usuario.admin || usuario.role === 'admin' ? (
                        'Sim'
                      ) : (
                        'Não'
                      )}
                    </td>
                    <td>
                      {editingId === usuario.id ? (
                        <input
                          type="text"
                          className={styles.select}
                          name="cargoEdit"
                          value={cargoEdit}
                          onChange={(e) => setCargoEdit(e.target.value)}
                          placeholder="Digite o cargo"
                        />
                      ) : usuario.cargo ? (
                        usuario.cargo
                      ) : usuario.admin || usuario.role === 'admin' ? (
                        'Administrador'
                      ) : (
                        'Funcionário'
                      )}
                    </td>
                    <td>{usuario.data ? usuario.data.slice(0, 10) : '-'}</td>
                    {isAdmin && (
                      <td className={styles.actionsCell}>
                        <div className={styles.actions}>
                          {editingId === usuario.id ? (
                            <>
                              <button
                                className={styles.saveBtn}
                                onClick={() => handleSave(usuario.id)}
                                title="Salvar"
                                aria-label="Salvar"
                              >
                                ✓
                              </button>
                              <button
                                className={styles.cancelBtn}
                                onClick={() => setEditingId(null)}
                                title="Cancelar"
                                aria-label="Cancelar"
                              >
                                ✕
                              </button>
                            </>
                          ) : (
                            <>
                              {canEditThisUser ? (
                                <button
                                  className={styles.editBtn}
                                  onClick={() => handleEdit(usuario)}
                                  title="Editar"
                                >
                                  ✏️
                                </button>
                              ) : (
                                <span
                                  className={styles.protectedBadge}
                                  title="Administrador principal protegido"
                                >
                                  Principal
                                </span>
                              )}
                              {canDeleteThisUser ? (
                                <button
                                  className={styles.deleteBtn}
                                  onClick={() => setDeleteUserId(usuario.id)}
                                  title="Excluir"
                                >
                                  🗑️
                                </button>
                              ) : null}
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {deleteUserId ? (
        <Close
          title="Excluir usuário"
          message="Deseja realmente excluir este usuário?"
          onConfirm={() => handleDelete(deleteUserId)}
          onCancel={() => setDeleteUserId(null)}
          confirmLabel="Excluir"
        />
      ) : null}
    </div>
  );
}

export default Usuarios;
