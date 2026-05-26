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

  const prompt = `Je bent een risico-expert voor kabelinstallatie-projecten van A.Hak Electron in Nederland (Liander/Alliander netbeheer). Projecten betreffen laagspanning, middenspanning, hoogspanning, glasvezel en datacommunicatie. Perceeleigenaren, ZRO-processen, GR-procedures, vergunningen, HDD-boringen en MSR-plaatsingen zijn gangbare onderwerpen.

Analyseer de opgegeven ongewenste gebeurtenis voor een klein project (TSB < €5.000.000). Gebruik de kwantificeertabel voor kleine projecten:
- Kans: 1=<5%, 2=5-15%, 3=15-25%, 4=25-35%, 5=35-45%, 6=45-55%, 7=55-85%
- Tijd: 1=<0.5wk, 2=0.5-1wk, 3=1-2wk, 4=2-4wk, 5=4-6wk, 6=6-8wk, 7=>2mnd
- Geld: 1=<€5k, 2=€5-10k, 3=€10-25k, 4=€25-50k, 5=€50-75k, 6=€75-100k, 7=>€100k
- Kwaliteit: 0=geen, 1=vragen intern, 2=onderzoek nodig, 3=afwijking spec, 4=aanpassing mogelijk, 5=herstel zichtbaar, 6=aanpassing specs nodig, 7=niet herstelbaar
- Veiligheid: 0=geen, 1=gering geen EHBO, 2=gering EHBO, 3=arts nodig, 4=grote impact verzuim, 5=verzuim>7wk, 6=blijvend letsel, 7=dodelijk
- Omgeving: 0=geen, 1=intern, 2=lokale media, 3=sectoronrust, 4=regionaal, 5=nationaal beperkt, 6=nationaal aanzienlijk, 7=internationaal

Geef de TOP 3 oorzaken, TOP 3 gevolgen en TOP 3 beheersmaatregelen (niet meer, niet minder).
Voor restrisico: schat de scores NA uitvoering van de beheersmaatregelen (typisch 1-2 punten lager dan initieel, minimaal 0).

Analyseer dit risico: "${gebeurtenis}"

Geef ALLEEN geldige JSON, geen markdown, geen uitleg, geen backticks:
{"oorzaken":"1. ...\n2. ...\n3. ...","gevolgen":"1. ...\n2. ...\n3. ...","beheer":"1. ...\n2. ...\n3. ...","kans_i":0,"tijd_i":0,"geld_i":0,"kwaliteit_i":0,"veiligheid_i":0,"omgeving_i":0,"kans_r":0,"tijd_r":0,"geld_r":0,"kwaliteit_r":0,"veiligheid_r":0,"omgeving_r":0,"toelichting":"1-2 zinnen onderbouwing scores"}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { 
            temperature: 0.2, 
            maxOutputTokens: 2048,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: `Gemini API fout ${response.status}: ${errText}` });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Aggressively extract JSON - find first { and last }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1) {
      return res.status(502).json({ error: `Geen JSON in response: ${text.slice(0, 200)}` });
    }
    
    const jsonStr = text.slice(firstBrace, lastBrace + 1);
    
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      return res.status(502).json({ error: `JSON parse fout: ${jsonStr.slice(0, 200)}` });
    }

    // Normalize array fields to newline-separated strings
    const textFields = ['oorzaken', 'gevolgen', 'beheer', 'toelichting'];
    for (const field of textFields) {
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
      kwaliteit_r: parsed.kwaliteit_r ?? Math.max(0, (parsed.kwaliteit_i || 0) - 1),
      veiligheid_r: parsed.veiligheid_r ?? Math.max(0, (parsed.veiligheid_i || 0) - 1),
      omgeving_r: parsed.omgeving_r ?? Math.max(0, (parsed.omgeving_i || 0) - 1),
      toelichting: parsed.toelichting || ''
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
