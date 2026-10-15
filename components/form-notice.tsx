export function FormNotice({ error, success }: { error?: string; success?: string }) {
  return <>{error && <p className="notice error" role="alert">{error}</p>}{success && <p className="notice success" role="status">{success}</p>}</>;
}
