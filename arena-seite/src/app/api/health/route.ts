export const dynamic = "force-dynamic";

/** Gesundheitsprüfung für den Hosting-Dienst. Die Anwendung braucht keine Datenbank. */
export function GET() {
  return Response.json({ ok: true });
}
