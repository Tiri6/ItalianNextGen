import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    titleEn: z.string(),
    excerpt: z.string(),
    excerptEn: z.string(),
    date: z.coerce.date(),
    /** Data e ora di pubblicazione (UTC). Se assente, l'articolo è nascosto finché non viene schedulato. */
    publishedAt: z.coerce.date().optional(),
    category: z.enum(['news', 'performance', 'mercato', 'editoriale', 'taccuino']),
    players: z.array(z.string()).default([]),
    /** ID delle competizioni collegate (vedi data/competitions.json), es. ["euro-u19-2026"] */
    competitions: z.array(z.string()).default([]),
    source: z.string().optional(),
    sourceUrl: z.string().optional(),
    /** URL o percorso (in /public) di una foto per l'articolo. Se assente, viene generata una copertina. */
    image: z.string().optional(),
    /** true = il corpo è HTML puro e viene mostrato così com'è (per editoriali con grafici ecc.) */
    html: z.boolean().default(false),
    /** true = articolo rimane in primo piano fino al giorno dopo (sticky post). Usato per il taccuino mattutino. */
    featured: z.boolean().default(false),
    /** false = questo articolo NON va su Instagram (vedi data/instagram.json). */
    social: z.boolean().default(true),
  }),
});

export const collections = { news };
