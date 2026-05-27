export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY niet ingesteld in Vercel' });

  const { gebeurtenis } = req.body || {};
  if (!gebeurtenis) return res.status(400).json({ error: 'Geen gebeurtenis opgegeven' });

  const systemPrompt = `Je bent een risico-expert voor kabelinstallatie-projecten van A.Hak Electron in Nederland (Liander/Alliander netbeheer). Projecten betreffen laagspanning, middenspanning, hoogspanning, glasvezel en datacommunicatie. Perceeleigenaren, ZRO-processen, GR-procedures, vergunningen, HDD-boringen en MSR-plaatsingen zijn gangbare onderwerpen.

Analyseer de opgegeven ongewenste gebeurtenis voor een klein project (TSB < €5.000.000).
Kwantificeertabel kleine projecten:
- Kans: 1=<5%, 2=5-15%, 3=15-25%, 4=25-35%, 5=35-45%, 6=45-55%, 7=55-85%
- Tijd: 1=<0.5wk, 2=0.5-1wk, 3=1-2wk, 4=2-4wk, 5=4-6wk, 6=6-8wk, 7=>2mnd
- Geld: 1=<€5k, 2=€5-10k, 3=€10-25k, 4=€25-50k, 5=€50-75k, 6=€75-100k, 7=>€100k
- Kwaliteit: 0=geen impact, 7=niet herstelbaar
- Veiligheid: 0=geen, 7=dodelijk
- Omgeving: 0=geen, 7=internationaal

Geef TOP 3 oorzaken, TOP 3 gevolgen, TOP 3 beheersmaatregelen (max 8 woorden per punt).
Geef ook initiële scores en restrisico scores na beheersmaatregelen (1-2 punten lager, min 0).

Reageer UITSLUITEND met geldige JSON, geen markdown, geen uitleg:
{"oorzaken":"1. x\n2. x\n3. x","gevolgen":"1. x\n2. x\n3. x","beheer":"1. x\n2. x\n3. x","kans_i":0,"tijd_i":0,"geld_i":0,"kwaliteit_i":0,"veiligheid_i":0,"omgeving_i":0,"kans_r":0,"tijd_r":0,"geld_r":0,"kwaliteit_r":0,"veiligheid_r":0,"omgeving_r":0,"toelichting":"max 10 woorden"}`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        max_tokens: 600,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyseer dit risico: "${gebeurtenis}"` }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: `Groq API fout ${response.status}: ${errText}` });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return res.status(502).json({ error: `JSON parse fout: ${text.slice(0, 200)}` });
    }

    // Normalize array fields
    for (const field of ['oorzaken', 'gevolgen', 'beheer']) {
      if (Array.isArray(parsed[field])) {
        parsed[field] = parsed[field].map((v, i) => `${i + 1}. ${v}`).join('\n');
      }
    }

    return res.status(200).json({
      oorzaken: parsed.oorzaken || '',
      gevolgen: parsed.gevolgen || '',
      beheer: parsed.beheer || '',
      kans_i: parsed.kans_i || 0,
      tijd_i: parsed.tijd_i || 0,
      geld_i: parsed.geld_i || 0,
      kwaliteit_i: parsed.kwaliteit_i || 0,
      veiligheid_i: parsed.veiligheid_i || 0,
      omgeving_i: parsed.omgeving_i || 0,
      kans_r: parsed.kans_r ?? Math.max(0, (parsed.kans_i || 0) - 2),
      tijd_r: parsed.tijd_r ?? Math.max(0, (parsed.tijd_i || 0) - 1),
      geld_r: parsed.geld_r ?? Math.max(0, (parsed.geld_i || 0) - 1),
      kwaliteit_r: parsed.kwaliteit_r ?? 0,
      veiligheid_r: parsed.veiligheid_r ?? 0,
      omgeving_r: parsed.omgeving_r ?? 0,
      toelichting: parsed.toelichting || ''
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
