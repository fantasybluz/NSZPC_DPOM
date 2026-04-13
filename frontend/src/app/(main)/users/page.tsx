'use client';

import { useState, useEffect, FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import Modal from '@/components/ui/Modal';

const ALL_PAGES = [
  { id: 'dashboard', label: '儀表板' },
  { id: 'inventory', label: '庫存管理' },
  { id: 'quotations', label: '訂單管理' },
  { id: 'suppliers', label: '盤商報價' },
  { id: 'purchases', label: '結款管理' },
  { id: 'reports', label: '報表/保固/維修' },
  { id: 'customers', label: '客戶管理' },
  { id: 'youtube', label: '社群追蹤 / 設定' },
  { id: 'categories', label: '分類管理' },
];

interface UserData {
  id: number;
  username: string;
  display_name: string;
  role: string;
  permissions: string[];
  is_active: number;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserData | null>(null);
  const { showToast } = useToast();
  const { isAdmin } = useAuth();

  const [form, setForm] = useState({
    username: '', password: '', display_name: '', role: 'user', is_active: 1, permissions: [] as string[],
  });

  const loadUsers = async () => {
    try {
      const data = await api.get<UserData[]>('/auth/users');
      setUsers(data);
    } catch (err: any) {
      showToast(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const openForm = (user?: UserData) => {
    if (user) {
      setEditUser(user);
      setForm({ username: user.username, password: '', display_name: user.display_name, role: user.role, is_active: user.is_active, permissions: user.permissions || [] });
    } else {
      setEditUser(null);
      setForm({ username: '', password: '', display_name: '', role: 'user', is_active: 1, permissions: [] });
    }
    setModalOpen(true);
  };

  const handleSave = async (e?: FormEvent) => {
    e?.preventDefault();
    try {
      if (editUser) {
        const data: any = { display_name: form.display_name, role: form.role, is_active: form.is_active, permissions: form.permissions };
        if (form.password) data.password = form.password;
        await api.put(`/auth/users/${editUser.id}`, data);
        showToast('已更新');
      } else {
        if (!form.username || !form.password) { showToast('帳號密碼必填', 'warning'); return; }
        await api.post('/auth/users', form);
        showToast('已新增');
      }
      setModalOpen(false);
      loadUsers();
    } catch (err: any) {
      showToast(err.message, 'danger');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('確定刪除此使用者？')) return;
    try {
      await api.del(`/auth/users/${id}`);
      showToast('已刪除');
      loadUsers();
    } catch (err: any) {
      showToast(err.message, 'danger');
    }
  };

  const togglePerm = (id: string) => {
    setForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(id) ? prev.permissions.filter(p => p !== id) : [...prev.permissions, id],
    }));
  };

  if (!isAdmin) return <div className="alert alert-danger">權限不足</div>;
  if (loading) return <div className="text-center p-5"><div className="spinner-border" /></div>;

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <p className="text-muted mb-0">管理使用者帳號與頁面存取權限</p>
        <button className="btn btn-primary btn-sm" onClick={() => openForm()}>
          <i className="bi bi-plus-lg" /> 新增使用者
        </button>
      </div>

      <div className="table-container">
        <div className="table-responsive">
          <table className="table table-hover">
            <thead>
              <tr><th>帳號</th><th>顯示名稱</th><th>角色</th><th>頁面權限</th><th>狀態</th><th>操作</th></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td><strong>{u.username}</strong></td>
                  <td>{u.display_name}</td>
                  <td><span className={`badge ${u.role === 'admin' ? 'bg-danger' : 'bg-secondary'}`}>{u.role === 'admin' ? '管理員' : '使用者'}</span></td>
                  <td>
                    {u.role === 'admin' ? <span className="text-muted">全部權限</span> :
                      (u.permissions || []).map(p => {
                        const page = ALL_PAGES.find(x => x.id === p);
                        return <span key={p} className="badge bg-light text-dark me-1">{page?.label || p}</span>;
                      })}
                  </td>
                  <td>{u.is_active ? <span className="badge bg-success">啟用</span> : <span className="badge bg-secondary">停用</span>}</td>
                  <td>
                    <button className="btn btn-sm btn-outline-primary me-1" onClick={() => openForm(u)}><i className="bi bi-pencil" /></button>
                    {u.username !== 'admin' && <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(u.id)}><i className="bi bi-trash" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal show={modalOpen} onClose={() => setModalOpen(false)}
        title={editUser ? `編輯使用者: ${editUser.username}` : '新增使用者'}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>取消</button>
          <button className="btn btn-primary" onClick={() => handleSave()}>{editUser ? '更新' : '新增'}</button>
        </>}>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">帳號 *</label>
            <input type="text" className="form-control" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} readOnly={!!editUser} />
          </div>
          <div className="col-md-6">
            <label className="form-label">{editUser ? '新密碼 (留空不變)' : '密碼 *'}</label>
            <input type="password" className="form-control" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="form-label">顯示名稱</label>
            <input type="text" className="form-control" value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} />
          </div>
          <div className="col-md-3">
            <label className="form-label">角色</label>
            <select className="form-select" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="user">使用者</option>
              <option value="admin">管理員</option>
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">狀態</label>
            <select className="form-select" value={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: parseInt(e.target.value) }))}>
              <option value={1}>啟用</option>
              <option value={0}>停用</option>
            </select>
          </div>
          <div className="col-12">
            <label className="form-label">頁面權限 <span className="text-muted small">(管理員自動擁有全部權限)</span></label>
            <div className="d-flex flex-wrap gap-3">
              {ALL_PAGES.map(p => (
                <div className="form-check" key={p.id}>
                  <input type="checkbox" className="form-check-input" id={`perm_${p.id}`} checked={form.permissions.includes(p.id)} onChange={() => togglePerm(p.id)} />
                  <label className="form-check-label" htmlFor={`perm_${p.id}`}>{p.label}</label>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-sm btn-outline-secondary mt-2"
              onClick={() => setForm(f => ({ ...f, permissions: ALL_PAGES.map(p => p.id) }))}>全選</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
