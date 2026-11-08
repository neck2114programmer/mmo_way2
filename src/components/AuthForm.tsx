"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { PASSWORD_MIN, validatePassword, validateUsername } from "@/game/appearance";

type Mode = "login" | "register";
type Fields = Partial<Record<"username" | "password" | "passwordRepeat", string>>;

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const uid = useId();
  const reg = mode === "register";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [show, setShow] = useState(false);
  const [fields, setFields] = useState<Fields>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || done) return;
    setError(null);
    const f: Fields = {};
    if (reg) {
      const a = validateUsername(username); if (a) f.username = a;
      const b = validatePassword(password, username); if (b) f.password = b;
      if (repeat !== password) f.passwordRepeat = "Пароли не совпадают.";
    } else {
      if (!username.trim()) f.username = "Введите логин.";
      if (!password) f.password = "Введите пароль.";
    }
    setFields(f);
    if (Object.keys(f).length) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reg ? { username: username.trim(), password, passwordRepeat: repeat } : { username: username.trim(), password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setFields(j.fields ?? {});
        setError(j.fields ? null : j.message ?? "Не удалось выполнить запрос.");
        if (j.fields && !Object.keys(j.fields).length) setError(j.message ?? null);
        setBusy(false);
        return;
      }
      setDone(true);
      router.replace("/game");
      router.refresh();
    } catch {
      setError("Нет соединения с сервером. Проверьте интернет и повторите попытку.");
      setBusy(false);
    }
  }

  const field = (key: keyof Fields, label: string, value: string, set: (v: string) => void, opts: { type?: string; auto: string; hint?: string }) => {
    const id = `${uid}-${key}`, err = fields[key];
    return (
      <div className="auth-field">
        <label htmlFor={id}>{label}</label>
        <input id={id} name={key} type={opts.type ?? "text"} value={value} onChange={(e) => set(e.target.value)} autoComplete={opts.auto}
          aria-invalid={!!err} aria-describedby={`${id}-d`} disabled={busy || done} spellCheck={false} autoCapitalize="none" required />
        <p id={`${id}-d`} className={err ? "auth-err" : "auth-hint"}>{err ?? opts.hint ?? "\u00a0"}</p>
      </div>
    );
  };

  return (
    <form onSubmit={submit} noValidate className="auth-card" aria-labelledby={`${uid}-t`}>
      <h1 id={`${uid}-t`} className="auth-title">{reg ? "Создание аккаунта" : "Вход в Эльдорию"}</h1>
      <p className="auth-sub">{reg ? "Станьте частью легенды. Аккаунт хранится на сервере, герои привязаны к нему." : "Продолжите путь своего героя."}</p>

      {field("username", "Логин", username, setUsername, { auto: "username", hint: reg ? "3–24 символа: латиница, цифры, _ . -" : undefined })}
      {field("password", "Пароль", password, setPassword, { type: show ? "text" : "password", auto: reg ? "new-password" : "current-password", hint: reg ? `Не короче ${PASSWORD_MIN} символов, буква и цифра` : undefined })}
      {reg && field("passwordRepeat", "Повторите пароль", repeat, setRepeat, { type: show ? "text" : "password", auto: "new-password" })}

      <label className="auth-check"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Показать пароль</label>

      {error && <div role="alert" className="auth-alert">{error}</div>}
      {done && <div role="status" className="auth-ok">{reg ? "Аккаунт создан! Входим в игру…" : "Добро пожаловать! Загружаем игру…"}</div>}

      <button type="submit" className="auth-btn" disabled={busy || done}>
        {busy ? (reg ? "Создаём аккаунт…" : "Входим…") : done ? "Переход…" : reg ? "Зарегистрироваться" : "Войти"}
      </button>

      <p className="auth-switch">
        {reg ? <>Уже есть аккаунт? <Link href="/login">Вернуться ко входу</Link></> : <>Впервые в Эльдории? <Link href="/register">Создать аккаунт</Link></>}
      </p>
    </form>
  );
}
