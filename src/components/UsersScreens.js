"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatDateTime, statusLabel } from "@/lib/format.js";
import { Banner, Field, PageHeader, api, boxField, dangerButton, errorText, primaryButton, secondaryButton } from "./ui.js";

function emptyUser() {
  return { fullName: "", email: "", mobileNumber: "", role: "user", isActive: true, password: "" };
}

export function UsersList() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/api/users?search=${encodeURIComponent(query)}&page=${page}`)
      .then(setResult)
      .catch((err) => setError(errorText(err)));
  }, [query, page]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        description="Add walkers and administrators. Passwords are stored only as hashes."
        actions={
          <Link href="/users/new" className={primaryButton}>
            Add user
          </Link>
        }
      />
      <Banner tone="error">{error}</Banner>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setQuery(search);
        }}
      >
        <input className={boxField} placeholder="Search name, email, or mobile" value={search} onChange={(event) => setSearch(event.target.value)} />
        <button className={secondaryButton} type="submit">Search</button>
      </form>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(result?.data || []).map((user) => (
              <tr key={user.userId} className="border-t border-border">
                <td className="px-3 py-2">{user.fullName}</td>
                <td className="px-3 py-2">{user.email}</td>
                <td className="px-3 py-2">{statusLabel(user.role)}</td>
                <td className="px-3 py-2">{user.isActive ? "Active" : "Inactive"}</td>
                <td className="px-3 py-2">
                  <Link className="text-primary" href={`/users/${user.userId}`}>View</Link>
                  <Link className="ml-3 text-primary" href={`/users/${user.userId}/edit`}>Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={result?.page || 1} pages={result?.pages || 1} total={result?.total || 0} onPage={setPage} />
    </div>
  );
}

export function UserForm({ userId }) {
  const router = useRouter();
  const [form, setForm] = useState(emptyUser());
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!userId) return;
    api(`/api/users/${userId}`)
      .then((data) => setForm({ ...data.user, password: "" }))
      .catch((err) => setError(errorText(err)));
  }, [userId]);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        fullName: form.fullName,
        email: form.email,
        mobileNumber: form.mobileNumber,
        role: form.role,
        isActive: Boolean(form.isActive),
      };
      if (userId) {
        await api(`/api/users/${userId}`, { method: "PATCH", body: JSON.stringify(payload) });
        setMessage("User updated.");
      } else {
        const created = await api("/api/users", {
          method: "POST",
          body: JSON.stringify({ ...payload, password: form.password }),
        });
        router.push(`/users/${created.user.userId}`);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    if (!window.confirm("Replace this user's password?")) return;
    setError("");
    setMessage("");
    try {
      await api(`/api/users/${userId}/password`, { method: "POST", body: JSON.stringify({ password }) });
      setPassword("");
      setMessage("Password updated. Share it with the user through a secure channel.");
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title={userId ? "Edit user" : "Add user"} description="Email addresses must be unique." />
      <Banner>{message}</Banner>
      <Banner tone="error">{error}</Banner>
      <form onSubmit={onSubmit} className="grid max-w-xl gap-4">
        <Field label="Full name">
          <input className={boxField} value={form.fullName} onChange={(event) => set("fullName", event.target.value)} required />
        </Field>
        <Field label="Email">
          <input className={boxField} type="email" value={form.email} onChange={(event) => set("email", event.target.value)} required />
        </Field>
        <Field label="Mobile number">
          <input className={boxField} value={form.mobileNumber || ""} onChange={(event) => set("mobileNumber", event.target.value)} />
        </Field>
        <Field label="Role">
          <select className={boxField} value={form.role} onChange={(event) => set("role", event.target.value)}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={Boolean(form.isActive)} onChange={(event) => set("isActive", event.target.checked)} />
          Active
        </label>
        {userId ? null : (
          <Field label="Password">
            <input className={boxField} type="password" value={form.password} onChange={(event) => set("password", event.target.value)} required minLength={8} />
          </Field>
        )}
        <div className="flex gap-2">
          <button className={primaryButton} disabled={pending} type="submit">{pending ? "Saving…" : "Save"}</button>
          <Link className={secondaryButton} href="/users">Back</Link>
        </div>
      </form>
      {userId ? (
        <form onSubmit={resetPassword} className="grid max-w-xl gap-3 rounded-2xl border border-border p-4">
          <h2 className="font-medium">Reset password</h2>
          <p className="text-sm text-muted-foreground">The new password is hashed before it is stored. It is not emailed.</p>
          <input className={boxField} type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
          <button className={secondaryButton} type="submit">Update password</button>
        </form>
      ) : null}
    </div>
  );
}

export function UserDetail({ userId }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api(`/api/users/${userId}`)
      .then((data) => setUser(data.user))
      .catch((err) => setError(errorText(err)));
  }, [userId]);

  async function remove() {
    if (!window.confirm("Delete this user? This cannot be undone.")) return;
    try {
      await api(`/api/users/${userId}`, { method: "DELETE" });
      router.push("/users");
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function toggleActive() {
    try {
      const data = await api(`/api/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ ...user, isActive: !user.isActive }),
      });
      setUser(data.user);
      setMessage(data.user.isActive ? "User activated." : "User deactivated.");
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (!user && !error) return <p className="text-sm text-muted-foreground">Loading user…</p>;

  return (
    <div className="space-y-4">
      <PageHeader
        title={user?.fullName || "User"}
        actions={
          <>
            <Link className={secondaryButton} href={`/users/${userId}/edit`}>Edit</Link>
            <button className={secondaryButton} type="button" onClick={toggleActive}>{user?.isActive ? "Deactivate" : "Activate"}</button>
            <button className={dangerButton} type="button" onClick={remove}>Delete</button>
          </>
        }
      />
      <Banner>{message}</Banner>
      <Banner tone="error">{error}</Banner>
      {user ? (
        <dl className="grid max-w-xl gap-3 text-sm">
          <Row label="Email" value={user.email} />
          <Row label="Mobile" value={user.mobileNumber || "—"} />
          <Row label="Role" value={statusLabel(user.role)} />
          <Row label="Status" value={user.isActive ? "Active" : "Inactive"} />
          <Row label="Created" value={formatDateTime(user.createdAt)} />
          <Row label="Updated" value={formatDateTime(user.updatedAt)} />
        </dl>
      ) : null}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="grid grid-cols-3 gap-2 border-b border-border py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2">{value}</dd>
    </div>
  );
}

export function Pager({ page, pages, total, onPage }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <p className="text-muted-foreground">{total} records</p>
      <div className="flex gap-2">
        <button className={secondaryButton} type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span className="px-2 py-2">{page} / {pages}</span>
        <button className={secondaryButton} type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}
