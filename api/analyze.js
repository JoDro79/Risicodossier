export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY niet ingesteld in Vercel' });

  const { gebeurtenis } = req.body || {};
  if (!gebeurtenis) return res.status(400).json({ error: 'Geen gebeurtenis opgegeven' });

  const gemini = async (prompt, maxTokens = 512) => {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens }
        })
      }
    );
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
    const d = await r.json();
    return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
  };

  const extractJson = (text) => {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first === -1 || last === -1 || last <= first) return null;
    try { return JSON.parse(text.slice(first, last + 1)); } catch { return null; }
  };

  try {
    // Call 1: tekst (oorzaken, gevolgen, beheersmaatregelen)
    const tekstPrompt = `Kabelinstallatie risico-expert Nederland (A.Hak Electron / Liander). Klein project.
Risico: "${gebeurtenis}"
Geef TOP 3 oorzaken, TOP 3 gevolgen, TOP 3 beheersmaatregelen. Max 6 woorden per punt.
Alleen JSON, geen markdown:
{"oorzaken":"1. x\\n2. x\\n3. x","gevolgen":"1. x\\n2. x\\n3. x","beheer":"1. x\\n2. x\\n3. x"}`;

    // Call 2: scores
    const scoresPrompt = `Kabelinstallatie risico-expert Nederland. Klein project (TSB<€5M).
Kwantificeertabel: Kans(1=<5%,7=55-85%), Tijd(1=<0.5wk,7=>2mnd), Geld(1=<€5k,7=>€100k), Kwaliteit(0-7), Veiligheid(0-7), Omgeving(0-7).
Risico: "${gebeurtenis}"
Geef initiële scores en restrisico scores (na beheersmaatregelen, 1-2 lager).
Alleen JSON, geen markdown:
{"kans_i":0,"tijd_i":0,"geld_i":0,"kwaliteit_i":0,"veiligheid_i":0,"omgeving_i":0,"kans_r":0,"tijd_r":0,"geld_r":0,"kwaliteit_r":0,"veiligheid_r":0,"omgeving_r":0,"toelichting":"max 8 woorden"}`;

    const [tekstRaw, scoresRaw] = await Promise.all([
      gemini(tekstPrompt, 300),
      gemini(scoresPrompt, 200)
    ]);

    const tekst = extractJson(tekstRaw);
    const scores = extractJson(scoresRaw);

    if (!tekst) return res.status(502).json({ error: `Tekst parse fout: ${tekstRaw.slice(0, 150)}` });
    if (!scores) return res.status(502).json({ error: `Scores parse fout: ${scoresRaw.slice(0, 150)}` });

    // Normalize array fields
    for (const field of ['oorzaken', 'gevolgen', 'beheer']) {
      if (Array.isArray(tekst[field])) {
        tekst[field] = tekst[field].map((v, i) => `${i + 1}. ${v}`).join('\n');
      }
    }

    return res.status(200).json({
      oorzaken: tekst.oorzaken || '',
      gevolgen: tekst.gevolgen || '',
      beheer: tekst.beheer || '',
      kans_i: scores.kans_i || 0,
      tijd_i: scores.tijd_i || 0,
      geld_i: scores.geld_i || 0,
      kwaliteit_i: scores.kwaliteit_i || 0,
      veiligheid_i: scores.veiligheid_i || 0,
      omgeving_i: scores.omgeving_i || 0,
      kans_r: scores.kans_r ?? Math.max(0, (scores.kans_i || 0) - 2),
      tijd_r: scores.tijd_r ?? Math.max(0, (scores.tijd_i || 0) - 1),
      geld_r: scores.geld_r ?? Math.max(0, (scores.geld_i || 0) - 1),
      kwaliteit_r: scores.kwaliteit_r ?? 0,
      veiligheid_r: scores.veiligheid_r ?? 0,
      omgeving_r: scores.omgeving_r ?? 0,
      toelichting: scores.toelichting || ''
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
