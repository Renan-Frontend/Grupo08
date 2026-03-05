import React from 'react';
import styles from './Usuarios.module.css';
import { UserContext } from '../../Context/UserContext';
import Pagination from '../Common/Pagination';
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
  const [usuarios, setUsuarios] = React.useState({
    data: [],
    page: 1,
    limit: 8,
    total: 0,
    has_next: false,
    has_prev: false,
  });
  const [editingId, setEditingId] = React.useState(null);
  const [nivelEdit, setNivelEdit] = React.useState('');
  const [cargoEdit, setCargoEdit] = React.useState('');
  const [adminEdit, setAdminEdit] = React.useState(false);
  const [deleteUserId, setDeleteUserId] = React.useState(null);

  const { user } = React.useContext(UserContext);
  const isAdmin = user?.role === 'admin' || user?.admin === true;

  const token = window.localStorage.getItem('token');

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

  const fetchUsuarios = (page = 1) => {
    const { url, options } = USER_GET(token);
    const usersUrl = new URL(url);
    usersUrl.searchParams.set('page', String(page));
    usersUrl.searchParams.set('limit', '8');

    fetch(usersUrl.toString(), options)
      .then((res) => res.json())
      .then((data) => setUsuarios(data))
      .catch((err) => console.error('Erro ao buscar usuários:', err));
  };

  React.useEffect(() => {
    fetchUsuarios();
  }, []);

  const handleEdit = (usuario) => {
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
    <section className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Administrar usuários</h1>
        </div>

        <div className={styles.content}>
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
                    return (
                      <tr key={usuario.id}>
                        <td>{usuario.nome}</td>
                        <td>{usuario.email}</td>
                        <td>
                          {editingId === usuario.id ? (
                            <select
                              className={styles.select}
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
                        <td>
                          {usuario.data ? usuario.data.slice(0, 10) : '-'}
                        </td>
                        {isAdmin && (
                          <td className={styles.actionsCell}>
                            <div className={styles.actions}>
                              {editingId === usuario.id ? (
                                <>
                                  <button
                                    className={styles.saveBtn}
                                    onClick={() => handleSave(usuario.id)}
                                  >
                                    Salvar
                                  </button>
                                  <button
                                    className={styles.cancelBtn}
                                    onClick={() => setEditingId(null)}
                                  >
                                    Cancelar
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    className={styles.editBtn}
                                    onClick={() => handleEdit(usuario)}
                                    title="Editar"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    className={styles.deleteBtn}
                                    onClick={() => setDeleteUserId(usuario.id)}
                                    title="Excluir"
                                  >
                                    🗑️
                                  </button>
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

          {/* Pagination component reutilizável */}
          <Pagination
            page={usuarios.page}
            limit={usuarios.limit}
            total={usuarios.total}
            hasNext={usuarios.has_next}
            hasPrev={usuarios.has_prev}
            onPageChange={fetchUsuarios}
          />
        </div>
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
    </section>
  );
}

export default Usuarios;
