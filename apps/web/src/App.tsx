import { useEffect, useState, type FormEvent } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dict, LANGS, type Lang } from "./i18n";
import { CmsPage } from "./CmsPage";

function useLang(): Lang {
  const { pathname } = useLocation();
  return /^\/en(?:\/|$)/.test(pathname) ? "en" : "ne";
}

async function fetchHealth(): Promise<boolean> {
  const res = await fetch("/api/v1/health");
  if (!res.ok) return false;
  const body = await res.json();
  return body?.success === true && body?.data?.status === "ok";
}

function Shell({ children }: { children: React.ReactNode }) {
  const lang = useLang();
  const t = dict[lang];
  const navigate = useNavigate();
  const location = useLocation();
  const other: Lang = lang === "ne" ? "en" : "ne";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t.siteName;
  }, [lang, t.siteName]);

  const switchLang = () => {
    const rest = location.pathname.replace(/^\/(ne|en)/, "");
    navigate(`/${other}${rest}`);
  };

  return (
    <>
      <a className="skip" href="#main">{t.skip}</a>
      <header className="site-header">
        <div className="container header-row">
          <NavLink to={`/${lang}`} className="brand" end>{t.siteName}</NavLink>
          <nav aria-label="Primary">
            <NavLink to={`/${lang}/education`}>{t.education}</NavLink>
            <NavLink to={`/${lang}/news`}>{t.news}</NavLink>
            <NavLink to={`/${lang}/games`}>{t.games}</NavLink>
            <NavLink to={`/${lang}/about`}>{t.about}</NavLink>
            <NavLink to={`/${lang}/cms`}>{t.cms}</NavLink>
            <NavLink to={`/${lang}/login`}>{t.account}</NavLink>
          </nav>
          <button type="button" className="lang-switch" onClick={switchLang} lang={other}>
            {t.switchTo}
          </button>
        </div>
      </header>
      <main id="main" className="container">{children}</main>
    </>
  );
}

function Home() {
  const t = dict[useLang()];
  const health = useQuery({ queryKey: ["health"], queryFn: fetchHealth, retry: false });
  const status = health.isLoading ? t.apiChecking : health.data ? t.apiOk : t.apiDown;
  return (
    <section className="hero">
      <h1>{t.heroTitle}</h1>
      <p>{t.heroBody}</p>
      <p className="status" data-state={health.isLoading ? "loading" : health.data ? "ok" : "down"}>
        {t.apiStatus}: {status}
      </p>
    </section>
  );
}

interface CurrentUser {
  id: string;
  email: string;
  roles: Array<{ name: string; permissions: string[] }>;
  permissions: string[];
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { message?: string };
}

function AuthPage() {
  const lang = useLang();
  const t = dict[lang];
  const location = useLocation();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const userQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async (): Promise<CurrentUser | null> => {
      const response = await fetch("/api/v1/auth/me", { credentials: "include" });
      if (response.status === 401) return null;
      if (!response.ok) throw new Error(t.authFailed);
      const body = await response.json() as ApiResponse<CurrentUser>;
      if (!body.success || !body.data) throw new Error(t.authFailed);
      return body.data;
    },
    retry: false,
  });
  const providersQuery = useQuery({
    queryKey: ["auth", "providers"],
    queryFn: async () => {
      const response = await fetch("/api/v1/auth/providers");
      if (!response.ok) throw new Error(t.authFailed);
      const body = await response.json() as ApiResponse<{ google: boolean }>;
      if (!body.success || !body.data) throw new Error(t.authFailed);
      return body.data;
    },
    retry: false,
  });

  const googleResult = new URLSearchParams(location.search).get("google");
  const statusMessage = googleResult === "success" ? t.googleSuccess : googleResult === "failed" ? t.googleFailed : "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/auth/${mode === "register" ? "register" : "login"}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          ...(mode === "register" && displayName.trim() ? { displayName: displayName.trim() } : {}),
        }),
      });
      const body = await response.json() as ApiResponse<CurrentUser>;
      if (!response.ok || !body.success) throw new Error(body.error?.message || t.authFailed);
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      setPassword("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t.authFailed);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setError("");
    try {
      const response = await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error(t.authFailed);
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : t.authFailed);
    }
  }

  return (
    <section className="auth-page">
      <h1>{t.account}</h1>
      {statusMessage && <p role="status">{statusMessage}</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {userQuery.isError && <p className="auth-error" role="alert">{t.authFailed}</p>}
      {userQuery.isLoading ? <p>{t.saving}</p> : userQuery.data ? (
        <div className="auth-card">
          <p>{t.signedInAs}: <strong>{userQuery.data.email}</strong></p>
          <button type="button" className="primary-button" onClick={signOut}>{t.signOut}</button>
        </div>
      ) : (
        <div className="auth-card">
          <div className="auth-tabs" role="group" aria-label={t.account}>
            <button type="button" aria-pressed={mode === "login"} onClick={() => setMode("login")}>{t.signIn}</button>
            <button type="button" aria-pressed={mode === "register"} onClick={() => setMode("register")}>{t.signUp}</button>
          </div>
          <form onSubmit={submit}>
            {mode === "register" && (
              <label>
                {t.displayName}
                <input autoComplete="name" maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              </label>
            )}
            <label>
              {t.email}
              <input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              {t.password}
              <input
                type="password"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                required
                minLength={mode === "register" ? 12 : 1}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {mode === "register" && <small>{t.passwordHint}</small>}
            </label>
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? t.saving : mode === "register" ? t.createAccount : t.signIn}
            </button>
          </form>
          {providersQuery.data?.google && (
            <>
              <p className="auth-divider">{t.or}</p>
              <a className="google-button" href={`/api/v1/auth/google?lang=${lang}`}>{t.continueGoogle}</a>
            </>
          )}
          {providersQuery.isError && <p className="auth-error" role="alert">{t.authFailed}</p>}
          <p className="auth-toggle">
            {mode === "login" ? t.noAccount : t.haveAccount}{" "}
            <button type="button" className="text-button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
              {mode === "login" ? t.createAccount : t.signIn}
            </button>
          </p>
        </div>
      )}
    </section>
  );
}

function Placeholder({ title }: { title: keyof (typeof dict)["en"] }) {
  const t = dict[useLang()];
  return (
    <section>
      <h1>{t[title]}</h1>
      <p>{t.comingSoon}</p>
    </section>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/ne" replace />} />
      {LANGS.map((l) => (
        <Route key={l} path={`/${l}`}>
          <Route index element={<Shell><Home /></Shell>} />
          <Route path="education" element={<Shell><Placeholder title="education" /></Shell>} />
          <Route path="news" element={<Shell><Placeholder title="news" /></Shell>} />
          <Route path="games" element={<Shell><Placeholder title="games" /></Shell>} />
          <Route path="about" element={<Shell><Placeholder title="about" /></Shell>} />
          <Route path="cms" element={<Shell><CmsRoute /></Shell>} />
          <Route path="login" element={<Shell><AuthPage /></Shell>} />
        </Route>
      ))}
      <Route path="*" element={<Navigate to="/ne" replace />} />
    </Routes>
  );
}

function CmsRoute() {
  const lang = useLang();
  const user = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async (): Promise<CurrentUser | null> => {
      const response = await fetch("/api/v1/auth/me", { credentials: "include" });
      if (response.status === 401) return null;
      if (!response.ok) throw new Error(dict[lang].authFailed);
      const body = await response.json() as ApiResponse<CurrentUser>;
      if (!body.success || !body.data) throw new Error(dict[lang].authFailed);
      return body.data;
    },
    retry: false,
  });
  if (user.isLoading) return <p>{dict[lang].saving}</p>;
  if (user.isError) return <p className="auth-error" role="alert">{dict[lang].authFailed}</p>;
  if (!user.data) return <p>{dict[lang].signInForCms} <NavLink to={`/${lang}/login`}>{dict[lang].signIn}</NavLink></p>;
  return <CmsPage lang={lang} permissions={user.data.permissions} />;
}
