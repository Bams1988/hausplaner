// Cloudflare Email Worker für den MindSpace-E-Mail-Eingang.
// Cloudflare → deine Domain → Email → Email Routing → „Catch-all“ → Aktion „An Worker senden“ → dieser Worker.
// Variablen (Settings → Variables): FUNCTION_URL = URL der Funktion inboundMail, INBOUND_SECRET = dasselbe Passwort wie in Firebase.
export default {
  async email(message, env) {
    if (message.rawSize > 25 * 1024 * 1024) { message.setReject('Nachricht zu groß (max. 25 MB).'); return; }
    const raw = await new Response(message.raw).arrayBuffer();
    const res = await fetch(env.FUNCTION_URL, {
      method: 'POST',
      headers: { 'content-type': 'message/rfc822', 'x-mindspace-secret': env.INBOUND_SECRET, 'x-mindspace-to': message.to, 'x-mindspace-from': message.from },
      body: raw,
    });
    if (res.status === 404) message.setReject('Diese MindSpace-Adresse gibt es nicht.');
    else if (!res.ok) throw new Error(`MindSpace antwortet mit ${res.status}`); // Fehler: Zustellung schlägt vorübergehend fehl, der Absender-Server versucht es meist später erneut
  },
};
