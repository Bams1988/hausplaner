# Baut die Apps-Script-Datei: ai.js (synchron gemacht) + Postbote-Logik.
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
ai = (root / 'ai.js').read_text()
ai = re.sub(r'^export\s+', '', ai, flags=re.M)
start = ai.index('async function post(')
end = ai.index('// Antwort als JSON aus einem Textblock lesen')
post = '''function post(apiKey, body) {
  let res;
  try {
    res = UrlFetchApp.fetch(API, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-api-key': apiKey.trim(), 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify(body),
    });
  } catch (e) {
    throw new AiError('Die KI hat nicht rechtzeitig geantwortet (' + e.message + ').');
  }
  const status = res.getResponseCode();
  if (status >= 300) {
    let msg = '';
    try { msg = JSON.parse(res.getContentText()).error.message || ''; } catch (e) {}
    if (status === 401) throw new AiError('Der API-Schlüssel ist ungültig. Prüfe ihn in Mindora unter Mehr → KI-Assistent.');
    if (status === 403) throw new AiError('Der API-Schlüssel hat keine Berechtigung.');
    if (/credit balance|billing/i.test(msg)) throw new AiError('Das Guthaben in der Anthropic Console ist aufgebraucht.');
    if (status === 404 || /^model:|model.*(not found|does not exist|not available)/i.test(msg)) throw new AiError('Das KI-Modell ist nicht verfügbar (' + msg + ').');
    if (status === 429) throw new AiError('Zu viele Anfragen oder Ausgabelimit erreicht.');
    if (status >= 500) throw new AiError('Die KI ist gerade überlastet.');
    throw new AiError('KI-Fehler ' + status + ': ' + (msg || 'unbekannt'));
  }
  return JSON.parse(res.getContentText());
}

'''
ai = ai[:start] + post + ai[end:]
ai = re.sub(r'\basync\s+function', 'function', ai)
ai = re.sub(r'\bawait\s+', '', ai)
assert 'fetch(' not in ai.replace('UrlFetchApp.fetch(', ''), 'fetch übrig'
assert 'AbortController' not in ai
teil = (root / 'postbote' / 'postbote-teil.js').read_text()
out = teil.replace('// ------------------------------------------------------------------ Einrichtung', '// ================== KI (aus ai.js übernommen) ==================\n' + ai + '\n// ------------------------------------------------------------------ Einrichtung', 1)
(root / 'MindSpace-Postbote.gs').write_text(out)
print('ok', len(out))
