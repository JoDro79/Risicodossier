# Risicodossier App — A.Hak Electron

Single-file HTML applicatie voor het beheren van risicodossiers, gebaseerd op het UMS-PB-K_R-001 format.

## Deployment op Vercel

1. Maak een nieuwe GitHub repository aan (bijv. `JoDro79/Risicodossier`)
2. Upload `index.html` naar de root van de repository
3. Ga naar [vercel.com](https://vercel.com) → New Project → importeer de repo
4. Geen buildstappen nodig — Vercel serveert de HTML direct
5. Klik Deploy

## Supabase tabellen

Voer dit SQL uit in je Supabase SQL Editor:

```sql
CREATE TABLE risico_projecten (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  naam TEXT NOT NULL,
  nummer TEXT,
  tsb NUMERIC,
  opsteller TEXT,
  datum_actualisatie DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE risico_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES risico_projecten(id) ON DELETE CASCADE,
  volgnummer INTEGER,
  gebeurtenis TEXT,
  oorzaken TEXT,
  gevolgen TEXT,
  beheersmaatregelen TEXT,
  kans_i INTEGER, tijd_i INTEGER, geld_i INTEGER,
  kwaliteit_i INTEGER, veiligheid_i INTEGER, omgeving_i INTEGER,
  kans_r INTEGER, tijd_r INTEGER, geld_r INTEGER,
  kwaliteit_r INTEGER, veiligheid_r INTEGER, omgeving_r INTEGER,
  eigenaar TEXT,
  status TEXT DEFAULT 'Open',
  fase TEXT,
  allocatie TEXT,
  actiehouder TEXT,
  deadline DATE,
  toelichting TEXT,
  opmerking TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE risico_projecten DISABLE ROW LEVEL SECURITY;
ALTER TABLE risico_items DISABLE ROW LEVEL SECURITY;
```

## Gebruik

1. Ga naar **Project** → Vul projectgegevens in
2. Ga naar **Risico's** → Voeg risico's toe
3. Per risico: typ de ongewenste gebeurtenis → klik **AI-analyse genereren**
4. Controleer en pas scores aan waar nodig
5. Klik **↓ Excel exporteren** voor het complete dossier in UMS-format
